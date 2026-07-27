/**
 * Unified catalog / watchlist reader for the pipeline.
 * CATALOG_SOURCE=supabase|sheets|auto — Supabase venues/promoters when seeded;
 * otherwise Venues/Promoters Sheets (WATCHLIST_SOURCE handles Fontes fallback).
 */

import type { WatchlistEntry } from '../types'
import type { Venue } from '@/models/Venue'
import { getConfig } from '../config'
import { normalizeIgHandle, parseIsActive } from './fontes-ig'
import {
  getWatchlistSource,
  readWatchlistFromCatalogSheets,
  readWatchlistFromFontesSheets,
  readTabSafe,
  TAB_VENUES,
  TAB_PROMOTERS,
} from './sheets-writer'
import { getSupabaseStore, isSupabaseStoreConfigured } from './supabase-store'

export type CatalogSource = 'sheets' | 'supabase' | 'auto'

export function getCatalogSource(): CatalogSource {
  return getConfig().CATALOG_SOURCE
}

type SbVenueRow = {
  venue_id: string
  name: string
  slug: string
  aliases: string[] | null
  instagram_handle: string | null
  primary_image_url: string | null
  description_short: string | null
  website_url: string | null
  venue_tags: string[] | null
  address: string | null
  city: string | null
  neighborhood: string | null
  region: string | null
  country: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  venue_url: string | null
  instagram_url: string | null
  is_active: boolean
}

type SbPromoterRow = {
  promoter_id: string
  name: string
  slug: string
  instagram_handle: string | null
  is_active: boolean
  primary_image_url: string | null
}

async function countSupabaseCatalog(): Promise<number> {
  if (!isSupabaseStoreConfigured()) return 0
  const sb = getSupabaseStore()
  const [v, p] = await Promise.all([
    sb.from('venues').select('venue_id', { count: 'exact', head: true }),
    sb.from('promoters').select('promoter_id', { count: 'exact', head: true }),
  ])
  return (v.count ?? 0) + (p.count ?? 0)
}

export async function readWatchlistFromSupabase(): Promise<WatchlistEntry[]> {
  if (!isSupabaseStoreConfigured()) return []
  const sb = getSupabaseStore()
  const [venuesRes, promotersRes] = await Promise.all([
    sb.from('venues').select('instagram_handle, name, is_active'),
    sb.from('promoters').select('instagram_handle, name, is_active'),
  ])
  if (venuesRes.error) {
    console.warn('[catalog-store] venues read:', venuesRes.error.message)
  }
  if (promotersRes.error) {
    console.warn('[catalog-store] promoters read:', promotersRes.error.message)
  }
  const byHandle = new Map<string, WatchlistEntry>()
  for (const r of (venuesRes.data as Array<{
    instagram_handle: string | null
    name: string
    is_active: boolean
  }>) || []) {
    const h = normalizeIgHandle(r.instagram_handle || '')
    if (!h) continue
    if (!byHandle.has(h)) {
      byHandle.set(h, {
        handle: h,
        type: 'venue',
        active: r.is_active !== false,
        notes: r.name,
      })
    }
  }
  for (const r of (promotersRes.data as Array<{
    instagram_handle: string | null
    name: string
    is_active: boolean
  }>) || []) {
    const h = normalizeIgHandle(r.instagram_handle || '')
    if (!h) continue
    if (!byHandle.has(h)) {
      byHandle.set(h, {
        handle: h,
        type: 'promoter',
        active: r.is_active !== false,
        notes: r.name,
      })
    }
  }
  return [...byHandle.values()]
}

/**
 * Pipeline scrape watchlist — prefers Supabase catalog when CATALOG_SOURCE allows,
 * else Sheets Venues/Promoters (+ Fontes via WATCHLIST_SOURCE).
 */
export async function readPipelineWatchlist(): Promise<WatchlistEntry[]> {
  const catalogSource = getCatalogSource()

  if (catalogSource !== 'sheets' && isSupabaseStoreConfigured()) {
    const fromSb = await readWatchlistFromSupabase()
    if (catalogSource === 'supabase' || fromSb.length > 0) {
      if (fromSb.length === 0) {
        console.warn('[catalog-store] CATALOG_SOURCE=supabase but 0 IG handles in venues/promoters')
      }
      return fromSb
    }
  }

  const watchlistSource = getWatchlistSource()
  if (watchlistSource === 'fontes') return readWatchlistFromFontesSheets()

  const catalog = await readWatchlistFromCatalogSheets()
  if (watchlistSource === 'catalog' || catalog.length > 0) {
    if (catalog.length === 0) {
      console.warn(
        '[catalog-store] Venues/Promoters yielded 0 IG handles — check sheet tabs or NEXT_PUBLIC_VENUES_CSV_URL'
      )
    }
    return catalog
  }

  console.warn(
    '[catalog-store] catalog empty with WATCHLIST_SOURCE=auto — falling back to Fontes IG'
  )
  return readWatchlistFromFontesSheets()
}

/** Load venues for resolve index from Supabase when available. */
export async function loadVenuesFromSupabase(): Promise<Venue[]> {
  if (!isSupabaseStoreConfigured()) return []
  const sb = getSupabaseStore()
  const { data, error } = await sb.from('venues').select('*')
  if (error) {
    console.warn('[catalog-store] loadVenuesFromSupabase:', error.message)
    return []
  }
  return ((data as SbVenueRow[]) || []).map((r) => ({
    venue_id: r.venue_id,
    name: r.name,
    slug: r.slug || r.venue_id,
    aliases: r.aliases ?? [],
    instagram_handle: r.instagram_handle ?? undefined,
    primary_image_url: r.primary_image_url ?? undefined,
    description_short: r.description_short ?? undefined,
    website_url: r.website_url ?? undefined,
    venue_address: r.address ?? undefined,
    neighborhood: r.neighborhood ?? undefined,
    city: r.city ?? undefined,
    region: r.region ?? undefined,
    country: r.country ?? undefined,
    postal_code: r.postal_code ?? undefined,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    venue_url: r.venue_url ?? undefined,
    instagram_url: r.instagram_url ?? undefined,
    tags: r.venue_tags ?? [],
    is_active: r.is_active !== false,
  }))
}

/** Upsert primary_image_url on Supabase catalog rows by IG handle. */
export async function updateCatalogPrimaryImages(
  kind: 'venue' | 'promoter',
  updates: Array<{ handle: string; primaryImageUrl: string }>
): Promise<{ updated: number; skipped: number }> {
  if (!isSupabaseStoreConfigured() || updates.length === 0) {
    return { updated: 0, skipped: updates.length }
  }
  const sb = getSupabaseStore()
  const table = kind === 'venue' ? 'venues' : 'promoters'
  let updated = 0
  let skipped = 0
  for (const u of updates) {
    const handle = normalizeIgHandle(u.handle)
    if (!handle || !u.primaryImageUrl) {
      skipped++
      continue
    }
    const { data: rows, error: findErr } = await sb
      .from(table)
      .select(kind === 'venue' ? 'venue_id' : 'promoter_id')
      .ilike('instagram_handle', handle)
      .limit(5)
    if (findErr || !rows?.length) {
      skipped++
      continue
    }
    for (const row of rows as Array<Record<string, string>>) {
      const id = kind === 'venue' ? row.venue_id : row.promoter_id
      const { error } = await sb
        .from(table)
        .update({
          primary_image_url: u.primaryImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq(kind === 'venue' ? 'venue_id' : 'promoter_id', id)
      if (error) skipped++
      else updated++
    }
  }
  return { updated, skipped }
}

export async function catalogHasSupabaseRows(): Promise<boolean> {
  return (await countSupabaseCatalog()) > 0
}

/** Re-export sheet helpers used by seed / diff scripts. */
export { readTabSafe, TAB_VENUES, TAB_PROMOTERS, parseIsActive }
