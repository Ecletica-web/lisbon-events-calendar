/**
 * Server-side recommendation telemetry.
 * Best-effort only — never throw into primary product flows.
 */

import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { RECOMMENDATION_ALGORITHM_VERSION } from '@/lib/recommendationEngine'
import type {
  CandidateSource,
  RecommendationScoreBreakdown,
} from '@/lib/recommendationEngine'

export type RecommendationAction =
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

export type RecommendationSessionContext = {
  timezone?: string
  local_hour?: number
  weekday?: number
  persona_id?: string
  persona_title?: string
  budget_min?: number
  budget_max?: number
  preferred_neighborhoods?: string[]
  preferred_time?: string | null
  max_distance_km?: number | null
  latitude?: number | null
  longitude?: number | null
  cold_start?: boolean
  has_feed_signals?: boolean
}

export type ScoreBreakdown = RecommendationScoreBreakdown

export type RecommendationTelemetryEvent = {
  sessionId?: string | null
  eventId: string
  action: RecommendationAction
  position?: number | null
  algorithmVersion?: string | null
  score?: number | null
  candidateSource?: string | null
  scoreBreakdown?: Partial<ScoreBreakdown> | Record<string, number> | null
  metadata?: Record<string, unknown> | null
}

const ACTIONS = new Set<RecommendationAction>([
  'impression',
  'open',
  'like',
  'unlike',
  'save',
  'unsave',
  'going',
  'cancel_going',
  'interested',
  'calendar_add',
  'ticket_click',
  'share',
  'pass',
  'hide',
])

export const MAX_IMPRESSION_BATCH = 50
export const MAX_EVENT_BATCH = 50

export type TelemetryResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; skipped?: boolean }

function isTelemetryEnabled(): boolean {
  return process.env.RECOMMENDATION_TELEMETRY_ENABLED === 'true'
}

export function isRecommendationTelemetryEnabled(): boolean {
  return isTelemetryEnabled()
}

function sanitizeMetadata(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  const out: Record<string, unknown> = {}
  const keys = Object.keys(meta).slice(0, 20)
  for (const key of keys) {
    if (key === 'ip' || key === 'userAgent' || key === 'user_agent' || key === 'description') continue
    const val = meta[key]
    if (val == null) continue
    if (typeof val === 'string') {
      out[key] = val.slice(0, 200)
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      out[key] = val
    } else if (Array.isArray(val)) {
      out[key] = val.slice(0, 20).map((v) => (typeof v === 'string' ? v.slice(0, 100) : v))
    }
  }
  return out
}

function normalizeEventId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  const trimmed = id.trim()
  if (!trimmed || trimmed.length > 200) return null
  return trimmed
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

function sanitizeContext(ctx: RecommendationSessionContext | null | undefined): RecommendationSessionContext {
  if (!ctx || typeof ctx !== 'object') return {}
  const out: RecommendationSessionContext = {}
  if (typeof ctx.timezone === 'string') out.timezone = ctx.timezone.slice(0, 64)
  if (typeof ctx.local_hour === 'number' && ctx.local_hour >= 0 && ctx.local_hour <= 23) {
    out.local_hour = Math.floor(ctx.local_hour)
  }
  if (typeof ctx.weekday === 'number' && ctx.weekday >= 0 && ctx.weekday <= 6) {
    out.weekday = Math.floor(ctx.weekday)
  }
  if (typeof ctx.persona_id === 'string') out.persona_id = ctx.persona_id.slice(0, 100)
  if (typeof ctx.persona_title === 'string') out.persona_title = ctx.persona_title.slice(0, 120)
  if (typeof ctx.budget_min === 'number') out.budget_min = ctx.budget_min
  if (typeof ctx.budget_max === 'number') out.budget_max = ctx.budget_max
  if (Array.isArray(ctx.preferred_neighborhoods)) {
    out.preferred_neighborhoods = ctx.preferred_neighborhoods
      .filter((n): n is string => typeof n === 'string')
      .slice(0, 20)
      .map((n) => n.slice(0, 80))
  }
  if (ctx.preferred_time === null || typeof ctx.preferred_time === 'string') {
    out.preferred_time = ctx.preferred_time == null ? null : ctx.preferred_time.slice(0, 32)
  }
  if (ctx.max_distance_km === null || typeof ctx.max_distance_km === 'number') {
    out.max_distance_km = ctx.max_distance_km
  }
  // Only store coarse coords if already present (rounded to ~1km)
  if (typeof ctx.latitude === 'number' && typeof ctx.longitude === 'number') {
    out.latitude = Math.round(ctx.latitude * 100) / 100
    out.longitude = Math.round(ctx.longitude * 100) / 100
  } else {
    if (ctx.latitude === null) out.latitude = null
    if (ctx.longitude === null) out.longitude = null
  }
  if (typeof ctx.cold_start === 'boolean') out.cold_start = ctx.cold_start
  if (typeof ctx.has_feed_signals === 'boolean') out.has_feed_signals = ctx.has_feed_signals
  return out
}

export type CreateSessionInput = {
  userId?: string | null
  personaId?: string | null
  surface: string
  city?: string
  context?: RecommendationSessionContext
  algorithmVersion?: string
}

export async function createRecommendationSession(
  input: CreateSessionInput
): Promise<TelemetryResult<{ sessionId: string; algorithmVersion: string }>> {
  try {
    if (!isTelemetryEnabled()) {
      return { ok: false, error: 'telemetry_disabled', skipped: true }
    }
    if (!supabaseServer) {
      return { ok: false, error: 'supabase_unconfigured', skipped: true }
    }
    const surface = (input.surface || '').trim().slice(0, 64)
    if (!surface) return { ok: false, error: 'invalid_surface' }

    const algorithmVersion = input.algorithmVersion || RECOMMENDATION_ALGORITHM_VERSION
    const context = sanitizeContext(input.context)
    const row = {
      user_id: input.userId || null,
      persona_id: input.personaId ? String(input.personaId).slice(0, 100) : context.persona_id || null,
      surface,
      algorithm_version: algorithmVersion,
      city: (input.city || 'lisbon').slice(0, 64),
      context,
    }

    const { data, error } = await supabaseServer
      .from('recommendation_sessions')
      .insert(row)
      .select('id')
      .single()

    if (error || !data?.id) {
      console.error('[recommendationTelemetry] createSession failed:', error?.message || 'no id')
      return { ok: false, error: error?.message || 'insert_failed' }
    }

    console.info('[recommendationTelemetry] session created', {
      sessionId: data.id,
      algorithmVersion,
      surface,
      userId: input.userId ? 'set' : null,
    })

    return { ok: true, data: { sessionId: data.id, algorithmVersion } }
  } catch (e) {
    console.error('[recommendationTelemetry] createSession error:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' }
  }
}

function rowFromEvent(
  ev: RecommendationTelemetryEvent,
  resolvedUserId: string | null
): Record<string, unknown> | null {
  const eventId = normalizeEventId(ev.eventId)
  if (!eventId) return null
  if (!ACTIONS.has(ev.action)) return null

  const sessionId =
    ev.sessionId && isValidUuid(ev.sessionId) ? ev.sessionId : null

  return {
    session_id: sessionId,
    user_id: resolvedUserId,
    event_id: eventId,
    action: ev.action,
    position: typeof ev.position === 'number' && Number.isFinite(ev.position) ? Math.floor(ev.position) : null,
    algorithm_version: ev.algorithmVersion || RECOMMENDATION_ALGORITHM_VERSION,
    score: typeof ev.score === 'number' && Number.isFinite(ev.score) ? ev.score : null,
    candidate_source:
      typeof ev.candidateSource === 'string' ? ev.candidateSource.slice(0, 64) : null,
    score_breakdown:
      ev.scoreBreakdown && typeof ev.scoreBreakdown === 'object' ? ev.scoreBreakdown : {},
    metadata: sanitizeMetadata(ev.metadata ?? undefined),
  }
}

export async function recordRecommendationEvent(
  event: RecommendationTelemetryEvent,
  resolvedUserId: string | null
): Promise<TelemetryResult<{ inserted: number }>> {
  return recordRecommendationEventsBatch([event], resolvedUserId)
}

export async function recordRecommendationEventsBatch(
  events: RecommendationTelemetryEvent[],
  resolvedUserId: string | null
): Promise<TelemetryResult<{ inserted: number; ignored: number }>> {
  try {
    if (!isTelemetryEnabled()) {
      return { ok: false, error: 'telemetry_disabled', skipped: true }
    }
    if (!supabaseServer) {
      return { ok: false, error: 'supabase_unconfigured', skipped: true }
    }
    if (!Array.isArray(events) || events.length === 0) {
      return { ok: false, error: 'empty_batch' }
    }
    if (events.length > MAX_EVENT_BATCH) {
      return { ok: false, error: `batch_too_large_max_${MAX_EVENT_BATCH}` }
    }

    const rows = events
      .map((ev) => rowFromEvent(ev, resolvedUserId))
      .filter((r): r is Record<string, unknown> => r != null)

    const ignored = events.length - rows.length
    if (rows.length === 0) {
      return { ok: true, data: { inserted: 0, ignored } }
    }

    let inserted = 0
    let dupIgnored = 0
    for (const row of rows) {
      const { error } = await supabaseServer.from('recommendation_events').insert(row)
      if (error) {
        const isDuplicate =
          error.code === '23505' ||
          /duplicate key|unique constraint/i.test(error.message || '')
        if (isDuplicate) {
          dupIgnored += 1
          continue
        }
        console.error('[recommendationTelemetry] insert failed:', error.message)
        return { ok: false, error: error.message }
      }
      inserted += 1
    }

    return { ok: true, data: { inserted, ignored: ignored + dupIgnored } }
  } catch (e) {
    console.error('[recommendationTelemetry] batch error:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' }
  }
}

/**
 * Verify session exists and optionally matches the authenticated user.
 * Anonymous sessions (user_id null) accept any caller; owned sessions require match.
 */
export async function assertSessionWritable(
  sessionId: string,
  resolvedUserId: string | null
): Promise<TelemetryResult<{ sessionId: string; algorithmVersion: string | null }>> {
  try {
    if (!isTelemetryEnabled()) {
      return { ok: false, error: 'telemetry_disabled', skipped: true }
    }
    if (!supabaseServer) {
      return { ok: false, error: 'supabase_unconfigured', skipped: true }
    }
    if (!isValidUuid(sessionId)) {
      return { ok: false, error: 'invalid_session_id' }
    }

    const { data, error } = await supabaseServer
      .from('recommendation_sessions')
      .select('id, user_id, algorithm_version')
      .eq('id', sessionId)
      .maybeSingle()

    if (error || !data) {
      return { ok: false, error: 'session_not_found' }
    }

    if (data.user_id && resolvedUserId && data.user_id !== resolvedUserId) {
      return { ok: false, error: 'session_forbidden' }
    }
    // Session owned by a user but caller is anonymous — reject to prevent hijacking
    if (data.user_id && !resolvedUserId) {
      return { ok: false, error: 'session_forbidden' }
    }

    return {
      ok: true,
      data: { sessionId: data.id, algorithmVersion: data.algorithm_version },
    }
  } catch (e) {
    console.error('[recommendationTelemetry] assertSessionWritable error:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' }
  }
}

export function primaryCandidateSource(sources: CandidateSource[] | undefined): string | null {
  if (!sources?.length) return null
  return sources[0]
}

export { RECOMMENDATION_ALGORITHM_VERSION }
