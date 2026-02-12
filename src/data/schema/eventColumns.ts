/**
 * Event CSV schema — single source of truth for parsing.
 * If a column is renamed, only this file needs editing.
 */

export const EventCsvColumns = [
  'event_id',
  'source_name',
  'source_event_id',
  'dedupe_key',
  'title',
  'description_short',
  'description_long',
  'start_datetime',
  'end_datetime',
  'timezone',
  'is_all_day',
  'status',
  'venue_id',
  'venue_name',
  'venue_address',
  'neighborhood',
  'city',
  'region',
  'country',
  'postal_code',
  'latitude',
  'longitude',
  'category',
  'tags',
  'price_min',
  'price_max',
  'currency',
  'is_free',
  'age_restriction',
  'language',
  'ticket_url',
  'primary_image_id',
  'primary_image_url',
  'image_credit',
  'source_url',
  'confidence_score',
  'promoter_id',
  'promoter_name',
  'first_seen_at',
  'last_seen_at',
  'changed_at',
  'change_hash',
  'source_count',
  'sources',
  'created_at',
  'updated_at',
  'opens_at',
  'recurrence_rule',
] as const

/** Legacy column names → current column names */
export const legacyColumnMap: Record<string, string> = {
  id: 'event_id',
  image_url: 'primary_image_url',
}

/** Required columns (at least one of event_id/id; title; start_datetime) */
export const requiredColumns = ['event_id', 'title', 'start_datetime'] as const

/** Default values when column missing */
export const columnDefaults = {
  timezone: 'Europe/Lisbon',
  is_all_day: false,
  status: 'scheduled',
  tags: [] as string[],
  is_free: false,
} as const

/** Resolve column name: use current name or legacy map */
export function resolveEventColumn(name: string): string {
  const trimmed = name?.trim()
  if (!trimmed) return trimmed
  return legacyColumnMap[trimmed] ?? trimmed
}
