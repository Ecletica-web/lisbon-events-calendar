/**
 * Dedupe fingerprint — same scheme as the app's eventsLoader
 * (normalized title | date | 30-min time bucket | venue_id, djb2 hash),
 * so pipeline-side dedupe agrees with app-side dedupe.
 */

/** djb2 — identical to src/data/loaders/utils.ts simpleHash */
export function simpleHash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(16)
}

function normalizeTitleForFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\p{Emoji}\p{Symbol}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function computeFingerprint(title: string, startIso: string, venueId: string): string {
  const d = new Date(startIso)
  const date = startIso.slice(0, 10)
  const bucket = Math.floor(d.getUTCMinutes() / 30) * 30
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(bucket).padStart(2, '0')}`
  return simpleHash(`${normalizeTitleForFingerprint(title)}|${date}|${time}|${venueId}`)
}

export interface FingerprintedCandidate {
  fingerprint: string
  confidence_score: number
  sources: string[]
}

/**
 * Within-batch dedupe: keep the highest-confidence row per fingerprint, merge sources.
 * `existingFingerprints` (from the Processed sheet) filters already-published events.
 */
export function dedupeCandidates<T extends FingerprintedCandidate>(
  candidates: T[],
  existingFingerprints: Set<string>
): { kept: T[]; droppedAsDuplicate: number; droppedAsExisting: number } {
  const byFingerprint = new Map<string, T>()
  let droppedAsDuplicate = 0
  let droppedAsExisting = 0

  for (const candidate of candidates) {
    if (existingFingerprints.has(candidate.fingerprint)) {
      droppedAsExisting++
      continue
    }
    const current = byFingerprint.get(candidate.fingerprint)
    if (!current) {
      byFingerprint.set(candidate.fingerprint, candidate)
    } else {
      droppedAsDuplicate++
      const winner = candidate.confidence_score > current.confidence_score ? candidate : current
      winner.sources = Array.from(new Set([...current.sources, ...candidate.sources]))
      byFingerprint.set(candidate.fingerprint, winner)
    }
  }

  return { kept: Array.from(byFingerprint.values()), droppedAsDuplicate, droppedAsExisting }
}
