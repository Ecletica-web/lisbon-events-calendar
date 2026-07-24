/**
 * Calculated confidence from field evidence quality − disagreement penalties.
 * Replaces trusting model self-reported scores as the sole gate signal.
 */

import type { ExtractedEvent } from '../types'
import type { MergeConflictField } from '../intelligence/merge-extractions'

export interface ConfidenceBreakdown {
  score: number
  fieldScores: Record<string, number>
  penalties: string[]
}

function hasEvidence(text?: string): boolean {
  return Boolean(text && text.trim().length >= 3)
}

/**
 * Score an extracted event. Model confidence is only a prior (capped), not the final score.
 */
export function calculateConfidence(
  event: ExtractedEvent,
  options?: {
    conflicts?: MergeConflictField[]
    tierEmptyDisagreement?: boolean
    hasSlideEvidence?: boolean
    criticalInferred?: boolean
  }
): ConfidenceBreakdown {
  const fieldScores: Record<string, number> = {}
  const penalties: string[] = []

  fieldScores.title = event.title?.trim().length >= 4 ? 1 : 0.2
  fieldScores.start = event.start_datetime && !isNaN(new Date(event.start_datetime).getTime()) ? 1 : 0
  fieldScores.venue = event.venue_name_raw?.trim() ? 0.8 : 0.2

  if (event.price_min != null || event.is_free === true || event.is_free === false) {
    fieldScores.price = 0.7
  } else {
    fieldScores.price = 0.4 // unknown is fine — not free
  }

  if (event.ticket_url?.trim()) {
    fieldScores.ticket = /^https?:\/\//i.test(event.ticket_url) ? 0.6 : 0.1
  } else {
    fieldScores.ticket = 0.5 // absent OK
  }

  if (options?.hasSlideEvidence || hasEvidence(event.on_slide_text_evidence)) {
    fieldScores.evidence = 1
  } else if (event.extraction_source === 'caption') {
    fieldScores.evidence = 0.7
  } else {
    fieldScores.evidence = 0.5
  }

  const weights: Record<string, number> = {
    title: 0.2,
    start: 0.25,
    venue: 0.2,
    price: 0.1,
    ticket: 0.05,
    evidence: 0.2,
  }

  let score = 0
  let wSum = 0
  for (const [k, w] of Object.entries(weights)) {
    score += (fieldScores[k] ?? 0) * w
    wSum += w
  }
  score = score / wSum

  // Blend lightly with model prior (never let model alone dominate)
  const prior = Math.min(event.confidence_score, 0.85)
  score = score * 0.75 + prior * 0.25

  const conflicts = options?.conflicts ?? []
  for (const c of conflicts) {
    score -= 0.12
    penalties.push(`conflict_${c}`)
  }
  if (options?.tierEmptyDisagreement) {
    score -= 0.2
    penalties.push('tier_empty_disagreement')
  }
  if (options?.criticalInferred) {
    score -= 0.25
    penalties.push('critical_inferred')
  }

  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100))
  return { score, fieldScores, penalties }
}

/** Heuristic: raw model notes / evidence mentioning inferred|assumed for critical fields */
export function detectCriticalInference(rawText: string, event: ExtractedEvent): boolean {
  const blob = `${rawText}\n${event.on_slide_text_evidence || ''}`.toLowerCase()
  if (!/(inferr|assum|typical|usually|probably|guess)/.test(blob)) return false
  // Only flag if we also have age/price/ticket that look invented
  const hasCritical =
    Boolean(event.age_restriction) ||
    Boolean(event.ticket_url) ||
    event.is_free === true ||
    event.price_min != null
  return hasCritical
}
