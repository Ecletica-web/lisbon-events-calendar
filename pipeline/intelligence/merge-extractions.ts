/**
 * Merge & arbitrate caption (Tier 1) vs vision (Tier 3/4) extractions.
 * Field-level preferences:
 *  - datetime: prefer vision when the caption event's confidence is below threshold
 *  - title: prefer caption unless its title is generic and vision has a better one
 *  - multi-event vision output (program posts) always wins over a single caption event
 *
 * Confidence is never max(caption, vision) — disagreements lower the score and emit conflicts.
 */

import type { ExtractedEvent, ExtractionResult } from '../types'
import { getConfig } from '../config'

const GENERIC_TITLE_PATTERNS = [
  /^event$/i, /^evento$/i, /^program(a|ação)?/i, /^agenda/i, /^untitled/i, /^post/i,
]

function isGenericTitle(title: string): boolean {
  const t = title.trim()
  return t.length < 4 || GENERIC_TITLE_PATTERNS.some((p) => p.test(t))
}

function normalizeTitleKey(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
}

function dayKey(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function venueKey(name?: string): string {
  return normalizeTitleKey(name || '')
}

export type MergeConflictField = 'date' | 'venue' | 'price' | 'is_free'

export interface MergeExtractionsResult {
  events: ExtractedEvent[]
  /** Global conflicts (also copied onto single-event merges) */
  conflicts: MergeConflictField[]
  /** Per merged event index → conflict fields */
  conflictsByIndex: Map<number, MergeConflictField[]>
  /** One tier returned events, the other returned none */
  tierEmptyDisagreement: boolean
}

function detectConflicts(caption: ExtractedEvent, vision: ExtractedEvent): MergeConflictField[] {
  const conflicts: MergeConflictField[] = []
  const cDay = dayKey(caption.start_datetime)
  const vDay = dayKey(vision.start_datetime)
  if (cDay && vDay && cDay !== vDay) conflicts.push('date')

  const cVenue = venueKey(caption.venue_name_raw)
  const vVenue = venueKey(vision.venue_name_raw)
  if (cVenue && vVenue && cVenue !== vVenue) conflicts.push('venue')

  if (
    caption.is_free != null &&
    vision.is_free != null &&
    caption.is_free !== vision.is_free
  ) {
    conflicts.push('is_free')
  }

  const cPrice = caption.price_min
  const vPrice = vision.price_min
  if (cPrice != null && vPrice != null && Math.abs(cPrice - vPrice) >= 1) {
    conflicts.push('price')
  }

  return conflicts
}

function mergeConfidence(caption: ExtractedEvent, vision: ExtractedEvent, conflicts: MergeConflictField[]): number {
  const base = Math.min(caption.confidence_score, vision.confidence_score)
  const penalty = conflicts.length * 0.15
  return Math.max(0, Math.min(1, base - penalty))
}

/** Merge one caption event with its matching vision event (same underlying event). */
function mergePair(
  caption: ExtractedEvent,
  vision: ExtractedEvent
): { event: ExtractedEvent; conflicts: MergeConflictField[] } {
  const cfg = getConfig()
  const conflicts = detectConflicts(caption, vision)
  const preferVisionDatetime =
    Boolean(vision.start_datetime) &&
    (!caption.start_datetime || caption.confidence_score < cfg.PIPELINE_MERGE_CAPTION_DATETIME_THRESHOLD)

  const preferVisionTitle = isGenericTitle(caption.title) && !isGenericTitle(vision.title)

  const event: ExtractedEvent = {
    title: preferVisionTitle ? vision.title : caption.title,
    description_short: caption.description_short || vision.description_short,
    description_long: caption.description_long || vision.description_long,
    category: caption.category || vision.category,
    tags: Array.from(new Set([...caption.tags, ...vision.tags])).slice(0, 5),
    start_datetime: preferVisionDatetime ? vision.start_datetime : caption.start_datetime,
    end_datetime: preferVisionDatetime
      ? (vision.end_datetime ?? caption.end_datetime)
      : (caption.end_datetime ?? vision.end_datetime),
    venue_name_raw: caption.venue_name_raw || vision.venue_name_raw,
    price_min: caption.price_min ?? vision.price_min,
    price_max: caption.price_max ?? vision.price_max,
    currency: caption.currency || vision.currency,
    is_free: caption.is_free ?? vision.is_free,
    ticket_url: caption.ticket_url || vision.ticket_url,
    age_restriction: caption.age_restriction || vision.age_restriction,
    confidence_score: mergeConfidence(caption, vision, conflicts),
    extraction_source: 'merged',
    source_slide_indices: vision.source_slide_indices,
    on_slide_text_evidence: vision.on_slide_text_evidence,
  }
  return { event, conflicts }
}

export function mergeExtractions(
  broad: ExtractionResult,
  vision: ExtractionResult | null
): MergeExtractionsResult {
  const conflictsByIndex = new Map<number, MergeConflictField[]>()
  const allConflicts = new Set<MergeConflictField>()

  const tierEmptyDisagreement = Boolean(
    vision &&
      ((broad.events.length === 0 && vision.events.length > 0) ||
        (broad.events.length > 0 && vision.events.length === 0))
  )

  if (!vision || vision.events.length === 0) {
    return {
      events: broad.events,
      conflicts: [],
      conflictsByIndex,
      tierEmptyDisagreement,
    }
  }
  if (broad.events.length === 0) {
    return {
      events: vision.events,
      conflicts: [],
      conflictsByIndex,
      tierEmptyDisagreement,
    }
  }

  // Program posts: vision found the split the caption could not express
  if (vision.events.length > broad.events.length && broad.events.length === 1) {
    const captionSeed = broad.events[0]
    const events: ExtractedEvent[] = []
    vision.events.forEach((v, i) => {
      const { event, conflicts } = mergePair({ ...captionSeed, confidence_score: 0 }, v)
      events.push(event)
      if (conflicts.length) {
        conflictsByIndex.set(i, conflicts)
        conflicts.forEach((c) => allConflicts.add(c))
      }
    })
    return {
      events,
      conflicts: [...allConflicts],
      conflictsByIndex,
      tierEmptyDisagreement: false,
    }
  }

  const merged: ExtractedEvent[] = []
  const usedVision = new Set<number>()

  for (const captionEvent of broad.events) {
    const key = normalizeTitleKey(captionEvent.title)
    const matchIndex = vision.events.findIndex(
      (v, i) => !usedVision.has(i) && normalizeTitleKey(v.title) === key
    )
    if (matchIndex >= 0) {
      usedVision.add(matchIndex)
      const { event, conflicts } = mergePair(captionEvent, vision.events[matchIndex])
      const idx = merged.length
      merged.push(event)
      if (conflicts.length) {
        conflictsByIndex.set(idx, conflicts)
        conflicts.forEach((c) => allConflicts.add(c))
      }
    } else if (vision.events.length === 1 && broad.events.length === 1) {
      usedVision.add(0)
      const { event, conflicts } = mergePair(captionEvent, vision.events[0])
      const idx = merged.length
      merged.push(event)
      if (conflicts.length) {
        conflictsByIndex.set(idx, conflicts)
        conflicts.forEach((c) => allConflicts.add(c))
      }
    } else {
      merged.push(captionEvent)
    }
  }

  vision.events.forEach((v, i) => {
    if (!usedVision.has(i)) merged.push(v)
  })

  return {
    events: merged,
    conflicts: [...allConflicts],
    conflictsByIndex,
    tierEmptyDisagreement: false,
  }
}
