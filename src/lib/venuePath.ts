/**
 * Canonical venue URL path helpers.
 * Always slugify names (strip punctuation/diacritics) — never put raw
 * "carmo rooftop, lisbon" into /venues/[slug].
 */

export function slugifyVenueSegment(input: string): string {
  return (input || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Build /venues/... href from the best available venue identifier. */
export function venueHref(parts: {
  venueId?: string | null
  venueKey?: string | null
  venueName?: string | null
  slug?: string | null
}): string {
  const raw =
    (parts.slug && parts.slug.trim()) ||
    (parts.venueId && parts.venueId.trim()) ||
    (parts.venueKey && parts.venueKey.trim()) ||
    (parts.venueName && parts.venueName.trim()) ||
    ''
  const slug = slugifyVenueSegment(raw)
  return `/venues/${encodeURIComponent(slug || 'unknown')}`
}

export function venueHrefFromEvent(event: {
  extendedProps?: {
    venueId?: string | null
    venueKey?: string | null
    venueName?: string | null
  }
}): string {
  const p = event.extendedProps || {}
  return venueHref({
    venueId: p.venueId,
    venueKey: p.venueKey,
    venueName: p.venueName,
  })
}

/** Normalize a URL slug param for comparison. */
export function normalizeVenueSlugParam(slug: string): string {
  try {
    return slugifyVenueSegment(decodeURIComponent(slug))
  } catch {
    return slugifyVenueSegment(slug)
  }
}
