/**
 * Merge & arbitrate caption (Tier 1) vs vision (Tier 3/4) extractions.
 * Field-level preferences:
 *  - datetime: prefer vision when the caption event's confidence is below threshold
 *  - title: prefer caption unless its title is generic and vision has a better one
 *  - multi-event vision output (program posts) always wins over a single caption event
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

/** Merge one caption event with its matching vision event (same underlying event). */
function mergePair(caption: ExtractedEvent, vision: ExtractedEvent): ExtractedEvent {
  const cfg = getConfig()
  const preferVisionDatetime =
    Boolean(vision.start_datetime) &&
    (!caption.start_datetime || caption.confidence_score < cfg.PIPELINE_MERGE_CAPTION_DATETIME_THRESHOLD)

  const preferVisionTitle = isGenericTitle(caption.title) && !isGenericTitle(vision.title)

  return {
    title: preferVisionTitle ? vision.title : caption.title,
    description_short: caption.description_short || vision.description_short,
    description_long: caption.description_long || vision.description_long,
    category: caption.category || vision.category,
    tags: Array.from(new Set([...caption.tags, ...vision.tags])).slice(0, 5),
    start_datetime: preferVisionDatetime ? vision.start_datetime : caption.start_datetime,
    end_datetime: preferVisionDatetime ? (vision.end_datetime ?? caption.end_datetime) : (caption.end_datetime ?? vision.end_datetime),
    venue_name_raw: caption.venue_name_raw || vision.venue_name_raw,
    price_min: caption.price_min ?? vision.price_min,
    price_max: caption.price_max ?? vision.price_max,
    currency: caption.currency || vision.currency,
    is_free: caption.is_free ?? vision.is_free,
    ticket_url: caption.ticket_url || vision.ticket_url,
    age_restriction: caption.age_restriction || vision.age_restriction,
    confidence_score: Math.max(caption.confidence_score, vision.confidence_score),
    extraction_source: 'merged',
    source_slide_indices: vision.source_slide_indices,
    on_slide_text_evidence: vision.on_slide_text_evidence,
  }
}

export function mergeExtractions(
  broad: ExtractionResult,
  vision: ExtractionResult | null
): ExtractedEvent[] {
  if (!vision || vision.events.length === 0) return broad.events
  if (broad.events.length === 0) return vision.events

  // Program posts: vision found the split the caption could not express
  if (vision.events.length > broad.events.length && broad.events.length === 1) {
    const captionSeed = broad.events[0]
    return vision.events.map((v) => mergePair({ ...captionSeed, confidence_score: 0 }, v))
  }

  // Pair by normalized title; unmatched vision events are appended as extra rows
  const merged: ExtractedEvent[] = []
  const usedVision = new Set<number>()

  for (const captionEvent of broad.events) {
    const key = normalizeTitleKey(captionEvent.title)
    const matchIndex = vision.events.findIndex(
      (v, i) => !usedVision.has(i) && normalizeTitleKey(v.title) === key
    )
    if (matchIndex >= 0) {
      usedVision.add(matchIndex)
      merged.push(mergePair(captionEvent, vision.events[matchIndex]))
    } else if (vision.events.length === 1 && broad.events.length === 1) {
      // Single event on both sides — same event even if titles differ
      usedVision.add(0)
      merged.push(mergePair(captionEvent, vision.events[0]))
    } else {
      merged.push(captionEvent)
    }
  }

  vision.events.forEach((v, i) => {
    if (!usedVision.has(i)) merged.push(v)
  })

  return merged
}
