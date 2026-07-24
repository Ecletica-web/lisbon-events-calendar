/**
 * Post-level entity reconciliation — collapse lineup / duplicate slides into one event.
 * Multi-day mega-spans (>36h) are flagged via validation; here we merge same-night splits.
 */

import type { ExtractedEvent } from '../types'
import { sameOccurrenceFuzzy, normalizeTitleForFingerprint } from './dedupe'

const MAX_SINGLE_SPAN_MS = 36 * 60 * 60 * 1000

function venueKey(e: ExtractedEvent): string {
  return (e.venue_name_raw || '').trim().toLowerCase()
}

function mergeLineup(a: ExtractedEvent, b: ExtractedEvent): ExtractedEvent {
  const titles = [a.title, b.title].map((t) => t.trim()).filter(Boolean)
  const uniqueTitles = Array.from(new Set(titles))
  // Prefer longer descriptive title as primary; stash others in description
  uniqueTitles.sort((x, y) => y.length - x.length)
  const primary = uniqueTitles[0]
  const lineup = uniqueTitles.slice(1)
  const tags = Array.from(new Set([...(a.tags || []), ...(b.tags || [])])).slice(0, 8)
  if (lineup.length) {
    for (const name of lineup) {
      const tag = normalizeTitleForFingerprint(name).slice(0, 32)
      if (tag && !tags.includes(tag)) tags.push(tag)
    }
  }
  const startA = a.start_datetime ? new Date(a.start_datetime).getTime() : Infinity
  const startB = b.start_datetime ? new Date(b.start_datetime).getTime() : Infinity
  const earlier = startA <= startB ? a : b
  const later = startA <= startB ? b : a
  const endCandidates = [a.end_datetime, b.end_datetime].filter(Boolean) as string[]
  let end_datetime = earlier.end_datetime ?? later.end_datetime
  if (endCandidates.length) {
    end_datetime = endCandidates.sort(
      (x, y) => new Date(y).getTime() - new Date(x).getTime()
    )[0]
  }

  const descParts = [a.description_short, b.description_short, lineup.length ? `Lineup: ${uniqueTitles.join(', ')}` : '']
    .filter(Boolean)
  return {
    ...earlier,
    title: primary,
    description_short: descParts[0] || earlier.description_short,
    description_long: [earlier.description_long, later.description_long, lineup.length ? `Artists: ${uniqueTitles.join(', ')}` : '']
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000),
    tags: tags.slice(0, 5),
    start_datetime: earlier.start_datetime,
    end_datetime,
    venue_name_raw: earlier.venue_name_raw || later.venue_name_raw,
    price_min: earlier.price_min ?? later.price_min,
    price_max: earlier.price_max ?? later.price_max,
    currency: earlier.currency || later.currency,
    is_free: earlier.is_free ?? later.is_free,
    ticket_url: earlier.ticket_url || later.ticket_url,
    age_restriction: earlier.age_restriction || later.age_restriction,
    confidence_score: Math.min(a.confidence_score, b.confidence_score),
    extraction_source: 'merged',
    source_slide_indices: Array.from(
      new Set([...(a.source_slide_indices || []), ...(b.source_slide_indices || [])])
    ).sort((x, y) => x - y),
    on_slide_text_evidence: [a.on_slide_text_evidence, b.on_slide_text_evidence]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 2000),
  }
}

/**
 * Collapse events that are the same occurrence (fuzzy title/time/venue).
 * Also clears end_datetime when span is implausibly long (leave to validate as review).
 */
export function reconcilePostEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  if (events.length <= 1) {
    return events.map(clampMegaSpan)
  }

  const groups: ExtractedEvent[][] = []
  for (const event of events) {
    let placed = false
    for (const group of groups) {
      const seed = group[0]
      if (
        sameOccurrenceFuzzy(
          { title: seed.title, startIso: seed.start_datetime || '', venueKey: venueKey(seed) },
          { title: event.title, startIso: event.start_datetime || '', venueKey: venueKey(event) }
        )
      ) {
        group.push(event)
        placed = true
        break
      }
    }
    if (!placed) groups.push([event])
  }

  return groups.map((group) => {
    const merged = group.reduce((acc, cur) => mergeLineup(acc, cur))
    return clampMegaSpan(merged)
  })
}

function clampMegaSpan(event: ExtractedEvent): ExtractedEvent {
  if (!event.start_datetime || !event.end_datetime) return event
  const start = new Date(event.start_datetime).getTime()
  const end = new Date(event.end_datetime).getTime()
  if (isNaN(start) || isNaN(end)) return event
  if (end - start > MAX_SINGLE_SPAN_MS) {
    // Drop impossible continuous end — validate will still see missing/short end; better than 79h blob
    return { ...event, end_datetime: undefined }
  }
  return event
}
