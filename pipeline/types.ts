/**
 * Shared pipeline types: raw scrape rows, extraction results, routing.
 * Column names match the existing Events_Raw / Needs_Review / Processed Events sheets
 * (see docs/SCHEMA.md and docs/PIPELINE.md).
 */

export type MediaType = 'image' | 'video' | 'carousel' | 'unknown'

export type PostPattern =
  | 'single_event'
  | 'multi_event'
  | 'monthly_program'
  | 'announcement'
  | 'recap'
  | 'not_event'

/** Normalized Instagram post — one row in the Events_Raw sheet. */
export interface EventsRawRow {
  id: string
  source_name: 'instagram'
  source_event_id: string
  source_url: string
  owner_username: string
  owner_id: string
  owner_full_name: string
  caption: string
  posted_at: string
  scraped_at: string
  run_id: string
  location_id: string
  location_name: string
  location_address: string
  latitude: string
  longitude: string
  media_type: MediaType
  media_urls: string
  thumbnail_url: string
  permalink: string
  hashtags: string
  mentions: string
  external_links: string
  like_count: string
  comment_count: string
  stored_image_url: string
  image_status: string
  image_storage_path: string
  image_error: string
  shortCode: string
  displayUrl: string
  /** Pipe-separated carousel slide URLs (original CDN) */
  carousel_slide_urls: string
  /** Pipe-separated archived (Supabase) slide URLs, same order */
  archived_slide_urls: string
  video_url: string
  raw_json: string
  created_at: string
  updated_at: string
}

/** One extracted event candidate (from caption or vision). */
export interface ExtractedEvent {
  title: string
  description_short?: string
  description_long?: string
  category?: string
  tags: string[]
  start_datetime?: string
  end_datetime?: string
  venue_name_raw?: string
  price_min?: number
  price_max?: number
  currency?: string
  /** Tri-state: true/false when known; null/omit when unknown. In Processed sheet rows, empty string means unknown. */
  is_free?: boolean | null
  ticket_url?: string
  age_restriction?: string
  confidence_score: number
  extraction_source: 'caption' | 'vision' | 'merged'
  /** 1-based slide indices this event was found on (vision only) */
  source_slide_indices?: number[]
  /** Verbatim date/time string found on the slide (vision only) — for debugging datetime conversion */
  on_slide_text_evidence?: string
}

export interface ExtractionResult {
  events: ExtractedEvent[]
  post_pattern?: PostPattern
  extraction_notes?: string
  /** Unparsed model output, preserved for prompt iteration */
  raw_model_text: string
  /** Model id used for this pass (for pipeline_extractions) */
  model?: string
  /** DocAI OCR slides (carousel vision), when available */
  ocr_slides?: unknown
  /** Whisper transcript (video pass), when available */
  video_transcript?: string
}

export interface PreFilterResult {
  is_event_post: boolean
  confidence: number
  post_pattern: PostPattern
  reason?: string
  raw_model_text: string
}

export type ValidationStatus = 'pass' | 'review' | 'fail'

export interface ValidationResult {
  status: ValidationStatus
  /** Pipe-separated codes, e.g. missing_or_invalid_start_datetime|low_confidence */
  reasons: string[]
}

/** Needs_Review sheet row (columns match the existing sheet header + Tier 5 context). */
export interface NeedsReviewRow {
  review_id: string
  source_name: string
  source_event_id: string
  source_url: string
  owner_username: string
  caption: string
  description_short: string
  description_long: string
  validation_status: string
  validation_reasons: string
  confidence_score: string
  start_datetime: string
  venue_name_raw: string
  route: string
  _raw_caption_ai_text: string
  raw_model_text: string
  created_at: string
  thumbnail_url: string
  stored_image_url: string
  image_storage_path: string
  image_error: string
  /** Tier 5 suggestion context for Tier 6 human review */
  verification_verdict: string
  verification_notes: string
  verification_sources: string
  suggested_corrections: string
}

/** Processed Events sheet row (columns match docs/SCHEMA.md event contract + pipeline extras). */
export interface ProcessedEventRow {
  event_id: string
  source_name: string
  source_event_id: string
  sources: string
  source_count: string
  source_url: string
  dedupe_key: string
  fingerprint: string
  title: string
  description_short: string
  description_long: string
  start_datetime: string
  end_datetime: string
  timezone: string
  is_all_day: string
  status: string
  venue_id: string
  venue_name: string
  venue_name_raw: string
  venue_address: string
  neighborhood: string
  city: string
  country: string
  latitude: string
  longitude: string
  category: string
  tags: string
  price_min: string
  price_max: string
  currency: string
  is_free: string
  age_restriction: string
  language: string
  ticket_url: string
  primary_image_url: string
  confidence_score: string
  first_seen_at: string
  last_seen_at: string
  changed_at: string
  created_at: string
  updated_at: string
  _raw_model_text: string
  post_pattern: string
  extraction_source: string
  on_slide_text_evidence: string
  /**
   * Publish authorization marker. Empty for auto-pass (needs Tier 5 clean verify).
   * `human_approved` after Tier 6 admin approve — publish accepts without clean verify.
   */
  publish_auth: string
}

/** Online verification audit row (Verification_Log tab) — Tier 5 suggestions for Tier 6. */
export interface VerificationLogRow {
  event_id: string
  title: string
  start_datetime: string
  venue_name: string
  source_url: string
  verdict: string
  confidence: string
  title_ok: string
  datetime_ok: string
  venue_ok: string
  notes: string
  suggested_corrections: string
  sources: string
  verified_at: string
  raw_model_text: string
}

export interface WatchlistEntry {
  handle: string
  type: 'venue' | 'promoter'
  active: boolean
  notes?: string
}

export interface RunLogEntry {
  run_id: string
  started_at: string
  finished_at: string
  mode: string
  handles: string
  posts_scraped: number
  new_rows: number
  apify_run_id: string
  status: 'success' | 'error'
  error: string
}
