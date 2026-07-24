/**
 * Browser helper for recommendation telemetry (best-effort, never blocks UI).
 */

export type ClientRecommendationAction =
  | 'impression'
  | 'open'
  | 'like'
  | 'unlike'
  | 'save'
  | 'unsave'
  | 'going'
  | 'cancel_going'
  | 'interested'
  | 'calendar_add'
  | 'ticket_click'
  | 'share'
  | 'pass'
  | 'hide'

export type RecommendationItemMeta = {
  eventId: string
  score: number
  position: number | null
  candidateSources: string[]
  candidateSource: string | null
  scoreBreakdown: Record<string, number>
  reasons: string[]
}

type SessionState = {
  sessionId: string | null
  algorithmVersion: string
  telemetryEnabled: boolean
  itemsByEventId: Map<string, RecommendationItemMeta>
}

let sessionState: SessionState = {
  sessionId: null,
  algorithmVersion: 'rules_v1',
  telemetryEnabled: false,
  itemsByEventId: new Map(),
}

const impressedKeys = new Set<string>()

export function setRecommendationSessionState(next: {
  sessionId: string | null
  algorithmVersion?: string
  telemetryEnabled: boolean
  items?: RecommendationItemMeta[]
}): void {
  sessionState = {
    sessionId: next.sessionId,
    algorithmVersion: next.algorithmVersion || 'rules_v1',
    telemetryEnabled: next.telemetryEnabled,
    itemsByEventId: new Map((next.items || []).map((i) => [i.eventId, i])),
  }
}

export function getRecommendationSessionState(): SessionState {
  return sessionState
}

export function clearRecommendationImpressionCache(): void {
  impressedKeys.clear()
}

function impressionKey(sessionId: string, eventId: string): string {
  return `${sessionId}:${eventId}`
}

async function authHeaders(): Promise<HeadersInit> {
  try {
    const { supabase } = await import('@/lib/supabase/client')
    const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` }
  } catch {
    /* ignore */
  }
  return {}
}

function metaFor(eventId: string): RecommendationItemMeta | undefined {
  return sessionState.itemsByEventId.get(eventId)
}

/** Queue impressions and flush shortly (debounced). */
const pendingImpressions: Array<{
  eventId: string
  position: number | null
  score: number | null
  candidateSource: string | null
  scoreBreakdown: Record<string, number>
}> = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flushImpressions(): Promise<void> {
  flushTimer = null
  if (!sessionState.telemetryEnabled || !sessionState.sessionId) {
    pendingImpressions.length = 0
    return
  }
  const batch = pendingImpressions.splice(0, 50)
  if (!batch.length) return

  const payload = JSON.stringify({
    sessionId: sessionState.sessionId,
    impressions: batch.map((b) => ({
      ...b,
      algorithmVersion: sessionState.algorithmVersion,
    })),
  })

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    }
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      // sendBeacon cannot set Authorization; fall back to fetch keepalive
      void fetch('/api/recommendations/impressions', {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true,
      }).catch(() => {})
      void blob
    } else {
      await fetch('/api/recommendations/impressions', {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true,
      })
    }
  } catch (e) {
    console.warn('[recommendationTelemetry] impression flush failed', e)
  }
}

/**
 * Record a genuine impression once per session+event.
 * Safe to call from active-card visibility timers.
 */
export function trackRecommendationImpression(eventId: string): void {
  if (!sessionState.telemetryEnabled || !sessionState.sessionId || !eventId) return
  const key = impressionKey(sessionState.sessionId, eventId)
  if (impressedKeys.has(key)) return
  impressedKeys.add(key)

  const meta = metaFor(eventId)
  pendingImpressions.push({
    eventId,
    position: meta?.position ?? null,
    score: meta?.score ?? null,
    candidateSource: meta?.candidateSource ?? meta?.candidateSources?.[0] ?? null,
    scoreBreakdown: meta?.scoreBreakdown ?? {},
  })

  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    void flushImpressions()
  }, 400)
}

/**
 * Fire-and-forget action telemetry after a successful product action.
 */
export function trackRecommendationAction(
  action: ClientRecommendationAction,
  eventId: string,
  extra?: { metadata?: Record<string, unknown> }
): void {
  if (!sessionState.telemetryEnabled || !eventId) return
  // Allow actions without session (anonymous / disabled session create) — still skip if flag off
  const meta = metaFor(eventId)
  const body = {
    sessionId: sessionState.sessionId,
    eventId,
    action,
    position: meta?.position ?? null,
    score: meta?.score ?? null,
    candidateSource: meta?.candidateSource ?? meta?.candidateSources?.[0] ?? null,
    scoreBreakdown: meta?.scoreBreakdown ?? {},
    algorithmVersion: sessionState.algorithmVersion,
    metadata: extra?.metadata ?? {},
  }

  void (async () => {
    try {
      await fetch('/api/recommendations/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeaders()),
        },
        body: JSON.stringify(body),
        keepalive: true,
      })
    } catch (e) {
      console.warn('[recommendationTelemetry] action failed', e)
    }
  })()
}

/** Pure helper for tests: whether an impression key would be recorded. */
export function wouldRecordImpression(sessionId: string | null, eventId: string): boolean {
  if (!sessionId || !eventId) return false
  return !impressedKeys.has(impressionKey(sessionId, eventId))
}

export function markImpressionRecordedForTests(sessionId: string, eventId: string): void {
  impressedKeys.add(impressionKey(sessionId, eventId))
}
