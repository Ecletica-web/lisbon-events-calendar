/**
 * Rule validation with pipe-separated reason codes.
 * Routing: pass → Processed Events (status scheduled); review/fail → Needs_Review.
 */

import type { ExtractedEvent, PostPattern, ValidationResult } from '../types'
import { getConfig } from '../config'

export const REASON = {
  MISSING_TITLE: 'missing_title',
  MISSING_START: 'missing_or_invalid_start_datetime',
  MISSING_VENUE: 'missing_venue_name_raw',
  LOW_CONFIDENCE: 'low_confidence',
  PAST_EVENT: 'past_event',
  PROGRAM_UNDERSPLIT: 'program_undersplit',
  VENUE_UNRESOLVED: 'venue_unresolved',
} as const

function isValidIsoDate(value?: string): boolean {
  if (!value) return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

export interface ValidateContext {
  post_pattern?: PostPattern
  events_in_post: number
  venueResolved: boolean
  /** Reference "now" — overridable for golden-set replays of historic data */
  now?: Date
}

export function validateEvent(event: ExtractedEvent, ctx: ValidateContext): ValidationResult {
  const cfg = getConfig()
  const reasons: string[] = []

  if (!event.title?.trim()) reasons.push(REASON.MISSING_TITLE)

  if (!isValidIsoDate(event.start_datetime)) {
    reasons.push(REASON.MISSING_START)
  }
  // Past start datetimes are allowed (do not push REASON.PAST_EVENT).

  if (!event.venue_name_raw?.trim()) reasons.push(REASON.MISSING_VENUE)
  else if (!ctx.venueResolved) reasons.push(REASON.VENUE_UNRESOLVED)

  if (event.confidence_score < cfg.PIPELINE_PUBLISH_CONFIDENCE_THRESHOLD) {
    reasons.push(REASON.LOW_CONFIDENCE)
  }

  if (ctx.post_pattern === 'monthly_program' && ctx.events_in_post === 1) {
    reasons.push(REASON.PROGRAM_UNDERSPLIT)
  }

  // Hard failures: cannot publish and human review is unlikely to fix from this row alone
  const hardFail =
    reasons.includes(REASON.MISSING_START) || reasons.includes(REASON.MISSING_TITLE)
  if (hardFail) return { status: 'fail', reasons }

  // Soft issues → human review; venue_unresolved alone is review (auto-fill may be wrong)
  if (reasons.length > 0) return { status: 'review', reasons }

  return { status: 'pass', reasons: [] }
}
