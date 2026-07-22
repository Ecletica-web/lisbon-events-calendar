/**
 * Venue resolution — Fontes IG - Venues is the source of truth (name + IG handle).
 * Optional Venues CSV enriches address / venue_id when the handle matches.
 */

import Papa from 'papaparse'
import type { Venue } from '@/models/Venue'
import { buildVenueIndex, resolveVenue, type VenueIndex, type VenueResolution } from '@/data/venueIndex'
import { getConfig } from '../config'
import { normalizeIgHandle, slugifyName } from '../sinks/fontes-ig'
import { readFontesVenues, readTabSafe, TAB_VENUES } from '../sinks/sheets-writer'

let cachedIndex: VenueIndex | null = null

function rowToVenue(row: Record<string, string>): Venue | null {
  const venueId = (row.venue_id ?? '').trim()
  const name = (row.name ?? row.venue_name ?? '').trim()
  if (!venueId || !name) return null
  return {
    venue_id: venueId,
    name,
    slug: (row.slug ?? '').trim() || venueId,
    aliases: (row.aliases ?? '').split('|').map((a) => a.trim()).filter(Boolean),
    instagram_handle: (row.instagram_handle ?? '').trim() || undefined,
    instagram_url: (row.instagram_url ?? '').trim() || undefined,
    venue_address: (row.address ?? '').trim() || undefined,
    neighborhood: (row.neighborhood ?? '').trim() || undefined,
    city: (row.city ?? '').trim() || undefined,
    latitude: parseFloat(row.lat ?? row.latitude ?? '') || undefined,
    longitude: parseFloat(row.lng ?? row.longitude ?? '') || undefined,
    tags: [],
  }
}

async function loadVenuesSheetRows(): Promise<Venue[]> {
  const cfg = getConfig()
  // Prefer live Sheets Venues tab (same spreadsheet as Fontes)
  try {
    const rows = await readTabSafe(TAB_VENUES)
    if (rows.length > 0) {
      return rows.map(rowToVenue).filter((v): v is Venue => v !== null)
    }
  } catch {
    /* fall through to CSV */
  }
  const url = cfg.NEXT_PUBLIC_VENUES_CSV_URL
  if (!url) return []
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LisbonEventsPipeline/1.0' } })
    if (!res.ok) return []
    const csvText = await res.text()
    const rows = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true }).data ?? []
    return rows.map(rowToVenue).filter((v): v is Venue => v !== null)
  } catch (err) {
    console.error('[venue-resolve] Venues CSV failed:', err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Build index: Fontes IG - Venues first (correct handles), then merge Venues sheet
 * metadata when handles match. Sheet-only venues (no Fontes handle) are still indexed
 * by name for leftover catalog rows.
 */
export async function loadVenueIndex(): Promise<VenueIndex | null> {
  if (cachedIndex) return cachedIndex

  const fontes = await readFontesVenues()
  const sheetVenues = await loadVenuesSheetRows()
  const byHandle = new Map<string, Venue>()

  for (const s of sheetVenues) {
    const h = normalizeIgHandle(s.instagram_handle || '')
    if (h) byHandle.set(h, s)
  }

  const venues: Venue[] = []
  const seenHandles = new Set<string>()

  for (const f of fontes) {
    if (!f.active || !f.handle) continue
    seenHandles.add(f.handle)
    const sheet = byHandle.get(f.handle)
    const slug = slugifyName(f.name) || f.handle
    venues.push({
      venue_id: sheet?.venue_id || `fontes_${f.handle}`,
      name: f.name || sheet?.name || f.handle,
      slug: sheet?.slug || slug,
      aliases: [
        ...(sheet?.aliases || []),
        f.handle,
        f.name,
      ].filter(Boolean) as string[],
      instagram_handle: f.handle,
      instagram_url: `https://www.instagram.com/${f.handle}/`,
      venue_address: sheet?.venue_address,
      neighborhood: sheet?.neighborhood,
      city: sheet?.city || 'Lisbon',
      latitude: sheet?.latitude,
      longitude: sheet?.longitude,
      tags: sheet?.tags || [],
    })
  }

  // Keep sheet venues that aren't in Fontes (name-only matches still useful)
  for (const s of sheetVenues) {
    const h = normalizeIgHandle(s.instagram_handle || '')
    if (h && seenHandles.has(h)) continue
    venues.push(s)
  }

  if (venues.length === 0) {
    console.warn('[venue-resolve] no venues from Fontes IG - Venues or Venues sheet')
    return null
  }

  console.log(
    `[venue-resolve] index: ${fontes.filter((f) => f.active).length} Fontes venues` +
      ` + ${sheetVenues.length} sheet rows → ${venues.length} indexed`
  )
  cachedIndex = buildVenueIndex(venues)
  return cachedIndex
}

export interface PipelineVenueResolution {
  venue_id: string
  venue_name: string
  venue_name_raw: string
  resolved: boolean
}

/**
 * Resolve a venue for an extracted event.
 * Tries the extracted venue name, then the post's IG location name, then the owner handle
 * (venue accounts post their own events) — against Fontes IG - Venues handles/names.
 */
export async function resolveEventVenue(
  venueNameRaw: string | undefined,
  locationName: string,
  ownerUsername: string
): Promise<PipelineVenueResolution> {
  const effectiveName = venueNameRaw?.trim() || locationName.trim()
  const index = await loadVenueIndex()

  if (!index) {
    return { venue_id: '', venue_name: '', venue_name_raw: effectiveName, resolved: false }
  }

  const candidates: [string | undefined, string | undefined, string | undefined][] = [
    [undefined, venueNameRaw, undefined],
    [undefined, locationName || undefined, undefined],
    [undefined, undefined, ownerUsername || undefined],
  ]

  for (const [id, name, source] of candidates) {
    if (!name && !source) continue
    const res: VenueResolution = resolveVenue(index, id, name, source)
    if (res.resolved) {
      return {
        venue_id: res.venue_id,
        venue_name: res.venue_name,
        venue_name_raw: effectiveName,
        resolved: true,
      }
    }
  }

  return { venue_id: 'unknown', venue_name: '', venue_name_raw: effectiveName, resolved: false }
}
