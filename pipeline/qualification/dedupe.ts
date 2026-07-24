/**
 * Dedupe fingerprint — shared scheme with the app's eventsLoader.
 *
 * Primary: source_post_id | occurrence date | 30-min bucket | normalized title | venue_key
 * Fallback (no source id): normalized title | date | 30-min bucket | venue_id (legacy)
 */

/** djb2 — identical to src/data/loaders/utils.ts simpleHash */
export function simpleHash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(16)
}

export function normalizeTitleForFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\p{Emoji}\p{Symbol}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param venueId resolved venue_id or stable display key
 * @param sourcePostId Instagram shortCode / source_event_id / source_url (optional but preferred)
 */
export function computeFingerprint(
  title: string,
  startIso: string,
  venueId: string,
  sourcePostId?: string
): string {
  const d = new Date(startIso)
  const date = startIso.slice(0, 10)
  const bucket = Math.floor((isNaN(d.getTime()) ? 0 : d.getUTCMinutes()) / 30) * 30
  const time = `${String(isNaN(d.getTime()) ? 0 : d.getUTCHours()).padStart(2, '0')}:${String(bucket).padStart(2, '0')}`
  const titleKey = normalizeTitleForFingerprint(title)
  const venueKey = (venueId || 'unknown').trim().toLowerCase()
  const sourceKey = (sourcePostId || '').trim().toLowerCase()

  if (sourceKey) {
    // Post-scoped: same IG post + same occurrence bucket + title collapses lineup/dupe slides
    return simpleHash(`${sourceKey}|${date}|${time}|${titleKey}|${venueKey}`)
  }
  return simpleHash(`${titleKey}|${date}|${time}|${venueKey}`)
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

/**
 * Fuzzy same-occurrence check within a post (lineup slides with slight title variance).
 * Same source + same day + within 60 minutes + similar title prefix OR shared venue.
 */
export function sameOccurrenceFuzzy(
  a: { title: string; startIso: string; venueKey: string },
  b: { title: string; startIso: string; venueKey: string }
): boolean {
  const da = new Date(a.startIso)
  const db = new Date(b.startIso)
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false
  if (a.startIso.slice(0, 10) !== b.startIso.slice(0, 10)) return false
  if (Math.abs(da.getTime() - db.getTime()) > 60 * 60 * 1000) return false
  const ta = normalizeTitleForFingerprint(a.title)
  const tb = normalizeTitleForFingerprint(b.title)
  if (ta === tb) return true
  if (a.venueKey && b.venueKey && a.venueKey === b.venueKey) {
    // Same venue + same hour window — lineup / artist-slide split
    return true
  }
  return false
}
