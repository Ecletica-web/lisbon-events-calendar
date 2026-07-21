/**
 * Column headers matching the live LEC Google Sheet tabs.
 * Keep in sync with Sheets; admin tables render these exactly.
 */

/** Events_Raw tab — scraped Instagram posts (+ legacy Apify / caption fields). */
export const EVENTS_RAW_COLUMNS = [
  'id',
  'source_name',
  'source_event_id',
  'source_url',
  'owner_username',
  'owner_id',
  'owner_full_name',
  'caption',
  'caption_language',
  'posted_at',
  'scraped_at',
  'run_id',
  'results_type',
  'search_type',
  'search_query',
  'location_id',
  'location_name',
  'location_address',
  'latitude',
  'longitude',
  'media_type',
  'media_urls',
  'thumbnail_url',
  'permalink',
  'hashtags',
  'mentions',
  'external_links',
  'like_count',
  'comment_count',
  'stored_image_url',
  'image_status',
  'image_storage_path',
  'image_error',
  'image_key',
  'is_sponsored',
  'raw_json',
  '_error',
  'created_at',
  'updated_at',
  'source',
  'date',
  'time',
  'venue',
  'caption_event_title',
  'caption_event_description_short',
  'caption_event_description_long',
  'caption_event_category',
  'caption_event_tags',
  'caption_event_start_datetime',
  'caption_event_end_datetime',
  'caption_event_is_free',
  'caption_event_ticket_url',
  'caption_event_confidence_score',
  'postUrl',
  'type',
  'shortCode',
  'url',
  'commentsCount',
  'firstComment',
  'latestComments',
  'dimensionsHeight',
  'dimensionsWidth',
  'displayUrl',
  'images',
  'alt',
  'likesCount',
  'timestamp',
  'childPosts',
  'ownerFullName',
  'ownerUsername',
  'ownerId',
  'isCommentsDisabled',
  'inputUrl',
  'mediaUrls',
  'captionParsed',
  'locationName',
  'locationId',
  'taggedUsers',
  'start_datetime',
  'end_datetime',
  'venue_name_raw',
] as const

/** Needs_Review tab — human review queue (+ expanded event fields). */
export const NEEDS_REVIEW_COLUMNS = [
  'review_id',
  'source_name',
  'source_event_id',
  'source_url',
  'owner_username',
  'caption',
  'description_short',
  'description_long',
  'validation_status',
  'validation_reasons',
  'confidence_score',
  'start_datetime',
  'venue_name_raw',
  'route',
  '_raw_caption_ai_text',
  'raw_model_text',
  'created_at',
  'thumbnail_url',
  'stored_image_url',
  'image_status',
  'image_storage_path',
  'image_error',
  'event_id',
  'sources',
  'source_count',
  'dedupe_key',
  'fingerprint',
  'title',
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
  'primary_image_url',
  'image_credit',
  'first_seen_at',
  'last_seen_at',
  'changed_at',
  'change_hash',
  'updated_at',
  '_error',
  '_raw_model_text',
  'promoter_id',
  'promoter_name',
] as const

/** Processed Events tab — published calendar feed source. */
export const PROCESSED_EVENTS_COLUMNS = [
  'event_id',
  'source_name',
  'source_event_id',
  'sources',
  'source_count',
  'source_url',
  'dedupe_key',
  'fingerprint',
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
  'venue_name_raw',
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
  'primary_image_url',
  'image_credit',
  'confidence_score',
  'first_seen_at',
  'last_seen_at',
  'changed_at',
  'change_hash',
  'created_at',
  'updated_at',
  '_error',
  '_raw_model_text',
  'promoter_id',
  'promoter_name',
] as const

export const TAB_EVENTS_RAW = 'Events_Raw'
export const TAB_NEEDS_REVIEW = 'Needs_Review'
export const TAB_PROCESSED_EVENTS = 'Processed Events'

const CAMEL_ALIASES: Record<string, string[]> = {
  shortCode: ['short_code', 'shortcode'],
  displayUrl: ['display_url'],
  ownerUsername: ['owner_username'],
  ownerFullName: ['owner_full_name'],
  ownerId: ['owner_id'],
  mediaUrls: ['media_urls'],
  locationName: ['location_name'],
  locationId: ['location_id'],
  postUrl: ['source_url', 'permalink'],
  likesCount: ['like_count'],
  commentsCount: ['comment_count'],
}

function cellValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/** Project a row onto exact sheet column names (fills missing keys with ''). */
export function toSheetColumns(
  row: Record<string, unknown>,
  columns: readonly string[]
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const col of columns) {
    if (row[col] != null && String(row[col]) !== '') {
      out[col] = cellValue(row[col])
      continue
    }
    const snake = col
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
    if (row[snake] != null && String(row[snake]) !== '') {
      out[col] = cellValue(row[snake])
      continue
    }
    const aliases = CAMEL_ALIASES[col] || []
    let found = ''
    for (const a of aliases) {
      if (row[a] != null && String(row[a]) !== '') {
        found = cellValue(row[a])
        break
      }
    }
    out[col] = found
  }
  return out
}

export function projectRows(
  rows: Record<string, unknown>[],
  columns: readonly string[]
): Record<string, string>[] {
  return rows.map((r) => toSheetColumns(r, columns))
}
