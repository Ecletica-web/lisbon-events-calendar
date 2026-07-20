/**
 * Mandatory event fields for vision-trigger decisions.
 * Aligns with SCHEMA + validation: title, valid start_datetime, venue.
 * IG location_name can satisfy venue when the caption omitted it.
 */

import type { ExtractedEvent, EventsRawRow, ExtractionResult } from '../types'

export const MANDATORY_FIELDS = ['title', 'start_datetime', 'venue_name_raw'] as const

function isValidIsoDate(value?: string): boolean {
  if (!value) return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

export interface MandatoryFieldCheck {
  complete: boolean
  /** Field names still missing (after applying location_name fallback for venue) */
  missing: string[]
}

/** Check one extracted event for mandatory fields. */
export function checkMandatoryFields(
  event: ExtractedEvent,
  locationNameFallback?: string
): MandatoryFieldCheck {
  const missing: string[] = []
  if (!event.title?.trim()) missing.push('title')
  if (!isValidIsoDate(event.start_datetime)) missing.push('start_datetime')
  const venue = event.venue_name_raw?.trim() || locationNameFallback?.trim()
  if (!venue) missing.push('venue_name_raw')
  return { complete: missing.length === 0, missing }
}

/**
 * Caption pass is "complete" when it produced ≥1 event and every event has
 * all mandatory fields (venue may come from the post's IG location tag).
 */
export function captionHasAllMandatoryFields(
  broad: ExtractionResult,
  row: EventsRawRow
): boolean {
  if (broad.events.length === 0) return false
  return broad.events.every((e) => checkMandatoryFields(e, row.location_name).complete)
}

/** Why vision should run — empty string when vision is not needed. */
export function visionTriggerReason(
  broad: ExtractionResult,
  row: EventsRawRow,
  forceVision?: boolean
): string {
  if (forceVision) return 'force_vision'
  if (broad.events.length === 0) return 'no_caption_events'
  const incomplete = broad.events
    .map((e, i) => {
      const check = checkMandatoryFields(e, row.location_name)
      return check.complete ? null : `event[${i}] missing ${check.missing.join(',')}`
    })
    .filter(Boolean)
  if (incomplete.length > 0) return incomplete.join('; ')
  return ''
}
