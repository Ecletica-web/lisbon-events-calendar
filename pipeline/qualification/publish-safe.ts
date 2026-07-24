/**
 * Defense-in-depth publish filter for Processed → Events Clean New.
 * Mirrors mechanical invariants so leftover unsafe Processed rows cannot go live.
 * Wave 5 adds verification / human-approval authorization on top.
 */

import { isBadTicketUrl } from './auto-repair'

export const PUBLISH_AUTH_HUMAN = 'human_approved'

export interface PublishSafeResult {
  safe: boolean
  reasons: string[]
}

export interface PublishAuthorizedResult {
  /** Mechanical invariants pass AND (clean verified OR human_approved). */
  authorized: boolean
  /** Mechanical isPublishSafe result. */
  safe: boolean
  reasons: string[]
  /** True when mechanically safe but missing verify / human auth. */
  unverified: boolean
}

function isValidIsoDate(value?: string): boolean {
  if (!value?.trim()) return false
  if (/[T ]24:/.test(value)) return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

/** True when suggested_corrections JSON is non-empty (Tier 5 proposed edits). */
export function hasSuggestedCorrections(raw?: string | null): boolean {
  if (!raw?.trim()) return false
  try {
    const obj = JSON.parse(raw) as unknown
    return Boolean(obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj as object).length > 0)
  } catch {
    return raw.trim() !== '{}'
  }
}

/** Clean Tier 5: verdict===verified and no suggested field corrections. */
export function isCleanVerification(verdict?: string | null, suggestedCorrections?: string | null): boolean {
  return (verdict ?? '').trim() === 'verified' && !hasSuggestedCorrections(suggestedCorrections)
}

/**
 * Row-shaped check (Processed / Clean sheet records).
 * Mechanical only — use isPublishAuthorized for the full publish gate.
 */
export function isPublishSafe(
  row: Record<string, string>,
  options?: { now?: Date; requireVenueId?: boolean }
): PublishSafeResult {
  const reasons: string[] = []
  const now = options?.now ?? new Date()
  const requireVenueId = options?.requireVenueId !== false

  const title = (row.title ?? '').trim()
  const start = (row.start_datetime ?? '').trim()
  const end = (row.end_datetime ?? '').trim()
  const venueId = (row.venue_id ?? '').trim()
  const ticketUrl = (row.ticket_url ?? '').trim()
  const isFree = (row.is_free ?? '').trim().toLowerCase()
  const priceMin = parseFloat(row.price_min ?? '')

  if (!title) reasons.push('missing_title')
  if (!isValidIsoDate(start)) {
    reasons.push('missing_or_invalid_start_datetime')
  } else if (new Date(start).getTime() < now.getTime()) {
    reasons.push('past_event')
  }

  if (requireVenueId && (!venueId || venueId === 'unknown')) {
    reasons.push('venue_unresolved')
  }

  if (end) {
    if (!isValidIsoDate(end)) {
      reasons.push('invalid_end_datetime')
    } else if (isValidIsoDate(start) && new Date(end).getTime() < new Date(start).getTime()) {
      reasons.push('end_before_start')
    } else if (isValidIsoDate(start) && new Date(end).getTime() === new Date(start).getTime()) {
      reasons.push('zero_duration')
    }
  }

  if (ticketUrl && isBadTicketUrl(ticketUrl)) {
    reasons.push('bad_ticket_url')
  }

  if ((isFree === 'true' || isFree === '1' || isFree === 'yes') && !isNaN(priceMin) && priceMin > 0) {
    reasons.push('price_free_conflict')
  }

  return { safe: reasons.length === 0, reasons }
}

/**
 * Full publish gate: mechanically safe AND (clean verified event_id OR human_approved).
 * Auto-pass rows leave publish_auth empty until Tier 5 clean-verify or Tier 6 approve.
 */
export function isPublishAuthorized(
  row: Record<string, string>,
  ctx?: {
    now?: Date
    requireVenueId?: boolean
    cleanVerifiedEventIds?: Set<string>
  }
): PublishAuthorizedResult {
  const safety = isPublishSafe(row, { now: ctx?.now, requireVenueId: ctx?.requireVenueId })
  if (!safety.safe) {
    return { authorized: false, safe: false, reasons: safety.reasons, unverified: false }
  }

  const auth = (row.publish_auth ?? '').trim().toLowerCase()
  if (auth === PUBLISH_AUTH_HUMAN) {
    return { authorized: true, safe: true, reasons: [], unverified: false }
  }

  const eventId = (row.event_id ?? '').trim()
  if (eventId && ctx?.cleanVerifiedEventIds?.has(eventId)) {
    return { authorized: true, safe: true, reasons: [], unverified: false }
  }

  return { authorized: false, safe: true, reasons: ['unverified'], unverified: true }
}
