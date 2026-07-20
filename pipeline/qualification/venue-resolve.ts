/**
 * Venue resolution — reuses the app's deterministic VenueIndex
 * (id → instagram handle → exact name → alias) against the same Venues CSV.
 */

import Papa from 'papaparse'
import type { Venue } from '@/models/Venue'
import { buildVenueIndex, resolveVenue, type VenueIndex, type VenueResolution } from '@/data/venueIndex'
import { getConfig } from '../config'

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

export async function loadVenueIndex(): Promise<VenueIndex | null> {
  if (cachedIndex) return cachedIndex
  const url = getConfig().NEXT_PUBLIC_VENUES_CSV_URL
  if (!url) return null
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LisbonEventsPipeline/1.0' } })
    if (!res.ok) return null
    const csvText = await res.text()
    const rows = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true }).data ?? []
    const venues = rows.map(rowToVenue).filter((v): v is Venue => v !== null)
    cachedIndex = buildVenueIndex(venues)
    return cachedIndex
  } catch (err) {
    console.error('[venue-resolve] failed to load venues CSV:', err instanceof Error ? err.message : err)
    return null
  }
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
 * (venue accounts post their own events).
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
      return { venue_id: res.venue_id, venue_name: res.venue_name, venue_name_raw: effectiveName, resolved: true }
    }
  }

  return { venue_id: 'unknown', venue_name: '', venue_name_raw: effectiveName, resolved: false }
}
