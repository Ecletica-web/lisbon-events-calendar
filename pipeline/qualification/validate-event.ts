/**
 * Rule validation with pipe-separated reason codes.
 * Routing: pass → Processed Events (status scheduled); review/fail → Needs_Review.
 *
 * Auto-repair runs before this module. Hard gates block auto-pass for past events,
 * unresolved venues, structural datetime issues, tier conflicts, and source-as-venue.
 */

import type { ExtractedEvent, PostPattern, ValidationResult } from '../types'
import { getConfig } from '../config'
import { isBadTicketUrl } from './auto-repair'

export const REASON = {
  MISSING_TITLE: 'missing_title',
  MISSING_START: 'missing_or_invalid_start_datetime',
  MISSING_VENUE: 'missing_venue_name_raw',
  LOW_CONFIDENCE: 'low_confidence',
  PAST_EVENT: 'past_event',
  PROGRAM_UNDERSPLIT: 'program_undersplit',
  VENUE_UNRESOLVED: 'venue_unresolved',
  END_BEFORE_START: 'end_before_start',
  INVALID_END: 'invalid_end_datetime',
  ZERO_DURATION: 'zero_duration',
  IMPLAUSIBLE_DURATION: 'implausible_duration',
  BAD_TICKET_URL: 'bad_ticket_url',
  PRICE_FREE_CONFLICT: 'price_free_conflict',
  SOURCE_AS_VENUE: 'source_as_venue',
  TIER_CONFLICT: 'tier_conflict',
  TIER_EMPTY_DISAGREEMENT: 'tier_empty_disagreement',
  CRITICAL_FIELD_INFERRED: 'critical_field_inferred',
  OUTSIDE_SERVICE_AREA: 'outside_service_area',
} as const

const MAX_DURATION_MS = 36 * 60 * 60 * 1000

function isValidIsoDate(value?: string): boolean {
  if (!value) return false
  if (/[T ]24:/.test(value)) return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

export interface ValidateContext {
  post_pattern?: PostPattern
  events_in_post: number
  venueResolved: boolean
  /** Reference "now" — overridable for golden-set replays of historic data */
  now?: Date
  /** Resolution matched only via posting account while extracted venue differed */
  sourceAsVenue?: boolean
  /** Merge-reported field conflicts (date/venue/price/free) */
  conflicts?: string[]
  /** Caption vs vision: one side empty */
  tierEmptyDisagreement?: boolean
  /** Wave 3: critical fields marked inferred/assumed without evidence */
  criticalFieldsInferred?: boolean
  /** Optional: city from venue resolve — non-Lisbon metro → review when set */
  city?: string
}

const LISBON_METRO = new Set([
  'lisboa',
  'lisbon',
  'cascais',
  'oeiras',
  'sintra',
  'almada',
  'seixal',
  'barreiro',
  'moita',
  'montijo',
  'alcochete',
  'loures',
  'odivelas',
  'amadora',
  'vila franca de xira',
  'mafra',
])

function isOutsideServiceArea(city?: string): boolean {
  if (!city?.trim()) return false
  const n = city
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  if (LISBON_METRO.has(n)) return false
  // Explicit non-metro Portuguese / foreign cities often seen in audit
  if (
    /porto|matosinhos|viseu|evora|coimbra|tondela|guimaraes|aveiro|barcelos|galicia|braga|faro/.test(
      n
    )
  ) {
    return true
  }
  return false
}

export function validateEvent(event: ExtractedEvent, ctx: ValidateContext): ValidationResult {
  const cfg = getConfig()
  const reasons: string[] = []
  const now = ctx.now ?? new Date()

  if (!event.title?.trim()) reasons.push(REASON.MISSING_TITLE)

  if (!isValidIsoDate(event.start_datetime)) {
    reasons.push(REASON.MISSING_START)
  } else {
    const start = new Date(event.start_datetime!)
    if (start.getTime() < now.getTime()) {
      reasons.push(REASON.PAST_EVENT)
    }
  }

  if (!event.venue_name_raw?.trim()) reasons.push(REASON.MISSING_VENUE)

  if (!ctx.venueResolved) {
    reasons.push(REASON.VENUE_UNRESOLVED)
  }

  if (ctx.sourceAsVenue) {
    reasons.push(REASON.SOURCE_AS_VENUE)
  }

  if (event.end_datetime?.trim()) {
    if (!isValidIsoDate(event.end_datetime)) {
      reasons.push(REASON.INVALID_END)
    } else if (isValidIsoDate(event.start_datetime)) {
      const start = new Date(event.start_datetime!)
      const end = new Date(event.end_datetime)
      if (end.getTime() < start.getTime()) {
        reasons.push(REASON.END_BEFORE_START)
      } else if (end.getTime() === start.getTime()) {
        reasons.push(REASON.ZERO_DURATION)
      } else if (end.getTime() - start.getTime() > MAX_DURATION_MS) {
        reasons.push(REASON.IMPLAUSIBLE_DURATION)
      }
    }
  }

  if (isBadTicketUrl(event.ticket_url)) {
    reasons.push(REASON.BAD_TICKET_URL)
  }

  if (event.is_free === true && event.price_min != null && event.price_min > 0) {
    reasons.push(REASON.PRICE_FREE_CONFLICT)
  }

  if (event.confidence_score < cfg.PIPELINE_PUBLISH_CONFIDENCE_THRESHOLD) {
    reasons.push(REASON.LOW_CONFIDENCE)
  }

  if (ctx.post_pattern === 'monthly_program' && ctx.events_in_post === 1) {
    reasons.push(REASON.PROGRAM_UNDERSPLIT)
  }

  if (ctx.conflicts && ctx.conflicts.length > 0) {
    reasons.push(REASON.TIER_CONFLICT)
  }

  if (ctx.tierEmptyDisagreement) {
    reasons.push(REASON.TIER_EMPTY_DISAGREEMENT)
  }

  if (ctx.criticalFieldsInferred) {
    reasons.push(REASON.CRITICAL_FIELD_INFERRED)
  }

  if (isOutsideServiceArea(ctx.city)) {
    reasons.push(REASON.OUTSIDE_SERVICE_AREA)
  }

  const hardFail =
    reasons.includes(REASON.MISSING_START) || reasons.includes(REASON.MISSING_TITLE)
  if (hardFail) return { status: 'fail', reasons }

  if (reasons.length > 0) return { status: 'review', reasons }

  return { status: 'pass', reasons: [] }
}
