/**
 * VenueIndex — deterministic venue resolution by id, name, alias, instagram handle
 */

import type { Venue } from '@/models/Venue'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
}

function normalizeHandle(h: string): string {
  return (h || '').trim().toLowerCase().replace(/^@/, '')
}

export interface VenueIndex {
  byId: Map<string, Venue>
  byName: Map<string, string>
  byAlias: Map<string, string>
  byInstagramHandle: Map<string, string>
}

export function buildVenueIndex(venues: Venue[]): VenueIndex {
  const byId = new Map<string, Venue>()
  const byName = new Map<string, string>()
  const byAlias = new Map<string, string>()
  const byInstagramHandle = new Map<string, string>()

  for (const v of venues) {
    byId.set(v.venue_id, v)
    const nameNorm = normalize(v.name)
    if (nameNorm) byName.set(nameNorm, v.venue_id)
    if (v.slug) byName.set(normalize(v.slug), v.venue_id)
    for (const a of v.aliases) {
      const aNorm = normalize(a)
      if (aNorm) byAlias.set(aNorm, v.venue_id)
    }
    if (v.instagram_handle) {
      const h = normalizeHandle(v.instagram_handle)
      if (h) byInstagramHandle.set(h, v.venue_id)
    }
    // Extract handle from instagram_url
    if (v.instagram_url) {
      const m = v.instagram_url.match(/instagram\.com\/([^/?]+)/i)
      if (m) byInstagramHandle.set(normalizeHandle(m[1]), v.venue_id)
    }
  }

  return { byId, byName, byAlias, byInstagramHandle }
}

export type VenueResolution =
  | { venue_id: string; venue_name: string; resolved: true }
  | { venue_id: 'unknown'; venue_name_raw: string; resolved: false }

/**
 * Resolve venue_id from event row.
 * Priority: venue_id exists in index → instagram_handle → exact name → alias → unknown
 */
export function resolveVenue(
  index: VenueIndex,
  venueIdRaw?: string,
  venueNameRaw?: string,
  sourceNameRaw?: string
): VenueResolution {
  const venueId = venueIdRaw?.trim()
  const venueName = venueNameRaw?.trim()
  const sourceName = sourceNameRaw?.trim()

  if (venueId && index.byId.has(venueId)) {
    const v = index.byId.get(venueId)!
    return { venue_id: venueId, venue_name: v.name, resolved: true }
  }

  const handle = normalizeHandle(sourceName || venueName || '')
  if (handle) {
    const id = index.byInstagramHandle.get(handle)
    if (id) {
      const v = index.byId.get(id)!
      return { venue_id: id, venue_name: v.name, resolved: true }
    }
  }

  const nameNorm = normalize(venueName || '')
  if (nameNorm) {
    const id = index.byName.get(nameNorm)
    if (id) {
      const v = index.byId.get(id)!
      return { venue_id: id, venue_name: v.name, resolved: true }
    }
    const idByAlias = index.byAlias.get(nameNorm)
    if (idByAlias) {
      const v = index.byId.get(idByAlias)!
      return { venue_id: idByAlias, venue_name: v.name, resolved: true }
    }
  }

  return {
    venue_id: 'unknown',
    venue_name_raw: venueName || venueId || 'unknown',
    resolved: false,
  }
}
