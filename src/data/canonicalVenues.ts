/**
 * Venue/source helpers. Venues are loaded from CSV (NEXT_PUBLIC_VENUES_CSV_URL);
 * no hardcoded list — use the same sheet for events and venues so resolution matches.
 */

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || name.toLowerCase().replace(/\s+/g, '-')
}

export interface CanonicalVenue {
  key: string
  name: string
  handle: string
  sourceType: string
  venueType: string
  eventTypes: string
}

/** No hardcoded venues — load from NEXT_PUBLIC_VENUES_CSV_URL or derive from events. */
export const CANONICAL_VENUES: CanonicalVenue[] = []

export const CANONICAL_VENUE_KEYS = new Set(CANONICAL_VENUES.map((v) => v.key))

/** Get canonical venue by key (always undefined when list is empty). */
export function getCanonicalVenueByKey(key: string): CanonicalVenue | undefined {
  return CANONICAL_VENUES.find((v) => v.key === key)
}

/** Normalize handle for matching (lowercase, no @) */
export function normalizeHandle(h: string): string {
  return (h || '').trim().toLowerCase().replace(/^@/, '')
}

/** Normalize venue/source name to slug for matching */
export function venueNameToSlug(name: string): string {
  return slug(name || '')
}
