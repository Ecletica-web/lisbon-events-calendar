/**
 * Venue CSV schema — single source of truth for parsing.
 * If a column is renamed, only this file needs editing.
 */

export const VenueCsvColumns = [
  'venue_id',
  'name',
  'slug',
  'aliases',
  'instagram_handle',
  'primary_image_url',
  'description_short',
  'website_url',
  'venue_tags',
  'address',
  'city',
  'neighborhood',
  'region',
  'country',
  'postal_code',
  'latitude',
  'longitude',
  'venue_url',
  'instagram_url',
  'tags',
  'created_at',
  'updated_at',
] as const

/** Legacy / alternate column names */
export const venueLegacyColumnMap: Record<string, string> = {
  venue_name: 'name',
  lat: 'latitude',
  lng: 'longitude',
}

export function resolveVenueColumn(name: string): string {
  const trimmed = name?.trim()
  if (!trimmed) return trimmed
  return venueLegacyColumnMap[trimmed] ?? trimmed
}
