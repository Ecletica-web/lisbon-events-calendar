/**
 * Domain model for Event — stable schema for ingestion
 */

export type EventStatus =
  | 'scheduled'
  | 'cancelled'
  | 'postponed'
  | 'sold_out'
  | 'draft'
  | 'archived'

export interface Event {
  event_id: string
  source_name?: string
  source_event_id?: string
  dedupe_key?: string
  title: string
  description_short?: string
  description_long?: string
  start_datetime: string
  end_datetime?: string
  timezone: string
  is_all_day: boolean
  status: EventStatus
  venue_id?: string
  venue_name?: string
  /** Raw venue name from CSV when venue_id is "unknown" (for manual review) */
  venue_name_raw?: string
  venue_address?: string
  neighborhood?: string
  city?: string
  region?: string
  country?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  category?: string
  tags: string[]
  price_min?: number
  price_max?: number
  currency?: string
  is_free: boolean
  age_restriction?: string
  language?: string
  ticket_url?: string
  primary_image_id?: string
  primary_image_url?: string
  image_credit?: string
  source_url?: string
  confidence_score?: number
  promoter_id?: string
  promoter_name?: string
  /** Ledger-lite audit fields */
  first_seen_at?: string
  last_seen_at?: string
  changed_at?: string
  change_hash?: string
  source_count?: number
  sources?: string[]
  /** Fingerprint for dedupe (sha1 of title|dateBucket|timeBucket|venue_id) */
  fingerprint?: string
  created_at?: string
  updated_at?: string
  _error?: string
}

/** Statuses that appear in default event listings */
export const VISIBLE_IN_LISTING: EventStatus[] = ['scheduled', 'sold_out', 'postponed']

/** Statuses hidden from default listings (but visible on detail if accessed directly) */
export const HIDDEN_FROM_LISTING: EventStatus[] = ['cancelled', 'archived']

/** Statuses never visible publicly */
export const NEVER_VISIBLE: EventStatus[] = ['draft']

export function isEventVisibleInListing(status: EventStatus): boolean {
  return VISIBLE_IN_LISTING.includes(status)
}

export function isEventVisibleOnDetail(status: EventStatus): boolean {
  return !NEVER_VISIBLE.includes(status)
}
