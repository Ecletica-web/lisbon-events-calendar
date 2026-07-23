import 'server-only'
/**
 * Split Venues/Promoters catalog rows using Fontes IG type as source of truth.
 * Catalog CSVs remain the data source; Fontes IG decides venue vs promoter.
 */

import { readWatchlistFromSheets } from '@/lib/googleSheets'
import type { Promoter } from '@/models/Promoter'

/** Minimal venue shape for Fontes-based split (avoids circular import with eventsAdapter). */
export type CatalogVenueLike = {
  venue_id: string
  name: string
  slug: string
  neighborhood?: string
  venue_address?: string
  description_short?: string
  primary_image_url?: string
  website_url?: string
  instagram_handle?: string
  tags: string[]
  latitude?: number
  longitude?: number
}

function normHandle(raw?: string | null): string {
  if (!raw) return ''
  let h = raw.trim()
  if (!h) return ''
  const ig = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (ig) h = ig[1]
  return h.replace(/^@/, '').toLowerCase().split(/[/?#]/)[0]
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export type FontesHandleSets = {
  venueHandles: Set<string>
  promoterHandles: Set<string>
  /** handle → display name from Fontes */
  promoterNames: Map<string, string>
}

/** Load Fontes IG handle sets. Returns empty sets if Sheets unavailable. */
export async function loadFontesHandleSets(): Promise<FontesHandleSets> {
  const empty: FontesHandleSets = {
    venueHandles: new Set(),
    promoterHandles: new Set(),
    promoterNames: new Map(),
  }
  try {
    const rows = await readWatchlistFromSheets()
    for (const row of rows) {
      if (!row.active) continue
      const h = normHandle(row.handle)
      if (!h) continue
      if (row.type === 'promoter') {
        empty.promoterHandles.add(h)
        empty.promoterNames.set(h, row.name || h)
      } else {
        empty.venueHandles.add(h)
      }
    }
  } catch (err) {
    console.warn('[catalogFontesSplit] Fontes IG unavailable:', err instanceof Error ? err.message : err)
  }
  return empty
}

/**
 * Remove venues whose IG handle is listed as a promoter in Fontes IG.
 * If Fontes has no data, returns venues unchanged.
 */
export function filterVenuesByFontes<T extends CatalogVenueLike>(
  venues: T[],
  fontes: FontesHandleSets
): T[] {
  if (fontes.promoterHandles.size === 0 && fontes.venueHandles.size === 0) {
    return venues
  }
  return venues.filter((v) => {
    const h = normHandle(v.instagram_handle)
    if (!h) return true
    if (fontes.promoterHandles.has(h)) return false
    return true
  })
}

/**
 * Build promoters list:
 * 1. Prefer Promoters CSV rows
 * 2. Drop any whose handle is explicitly a Fontes venue
 * 3. If CSV empty, synthesize from Fontes promoters (+ optional venue-catalog rows misfiled as venues)
 */
export function resolvePromotersCatalog(
  csvPromoters: Promoter[],
  venues: CatalogVenueLike[],
  fontes: FontesHandleSets
): Promoter[] {
  const byHandle = new Map<string, Promoter>()

  const add = (p: Promoter) => {
    const h = normHandle(p.instagram_handle) || p.promoter_id
    if (!h) return
    if (fontes.venueHandles.has(normHandle(p.instagram_handle))) return
    if (!byHandle.has(h)) byHandle.set(h, p)
  }

  for (const p of csvPromoters) {
    if (p.is_active) add(p)
  }

  // Pull misfiled promoter rows out of venues catalog when Fontes says promoter
  if (fontes.promoterHandles.size > 0) {
    for (const v of venues) {
      const h = normHandle(v.instagram_handle)
      if (!h || !fontes.promoterHandles.has(h)) continue
      if (byHandle.has(h)) continue
      add({
        promoter_id: v.venue_id || toSlug(v.name),
        name: fontes.promoterNames.get(h) || v.name,
        slug: v.slug || toSlug(v.name),
        instagram_handle: v.instagram_handle,
        website_url: v.website_url,
        description_short: v.description_short,
        primary_image_url: v.primary_image_url,
        is_active: true,
      })
    }
  }

  // If still empty, synthesize purely from Fontes promoters
  if (byHandle.size === 0 && fontes.promoterHandles.size > 0) {
    for (const h of fontes.promoterHandles) {
      const name = fontes.promoterNames.get(h) || h
      add({
        promoter_id: toSlug(name) || h,
        name,
        slug: toSlug(name) || h,
        instagram_handle: h,
        is_active: true,
      })
    }
  }

  return Array.from(byHandle.values()).sort((a, b) => a.name.localeCompare(b.name))
}
