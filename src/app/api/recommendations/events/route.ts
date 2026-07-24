/**
 * POST /api/recommendations/events
 * Best-effort contextual action telemetry (like/save/open/…).
 * Does not replace user_interactions — append-only behavioural log only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import {
  assertSessionWritable,
  isRecommendationTelemetryEnabled,
  MAX_EVENT_BATCH,
  recordRecommendationEvent,
  recordRecommendationEventsBatch,
  type RecommendationAction,
  type RecommendationTelemetryEvent,
} from '@/lib/recommendationTelemetry'
import { RECOMMENDATION_ALGORITHM_VERSION } from '@/lib/recommendationEngine'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set<RecommendationAction>([
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

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const bearer = getBearer(request)
  if (!bearer || !supabaseServer) return null
  const { data, error } = await supabaseServer.auth.getUser(bearer)
  if (error || !data.user) return null
  return data.user.id
}

export async function POST(request: NextRequest) {
  if (!isRecommendationTelemetryEnabled()) {
    return NextResponse.json({ ok: true, telemetryEnabled: false, recorded: 0 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.user_id != null || body.userId != null) {
    return NextResponse.json({ error: 'user_id must not be supplied by client' }, { status: 400 })
  }

  const userId = await resolveUserId(request)
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null

  if (sessionId) {
    const sessionCheck = await assertSessionWritable(sessionId, userId)
    if (!sessionCheck.ok) {
      const status =
        sessionCheck.error === 'session_forbidden'
          ? 403
          : sessionCheck.error === 'session_not_found'
            ? 404
            : 400
      return NextResponse.json({ error: sessionCheck.error }, { status })
    }
  }

  const batch = Array.isArray(body.events) ? body.events : null
  if (batch) {
    if (batch.length > MAX_EVENT_BATCH) {
      return NextResponse.json({ error: `batch exceeds max ${MAX_EVENT_BATCH}` }, { status: 400 })
    }
    const events: RecommendationTelemetryEvent[] = []
    for (const raw of batch) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      const action = r.action as RecommendationAction
      if (!ALLOWED.has(action)) continue
      if (typeof r.eventId !== 'string') continue
      events.push({
        sessionId,
        eventId: r.eventId,
        action,
        position: typeof r.position === 'number' ? r.position : null,
        score: typeof r.score === 'number' ? r.score : null,
        candidateSource: typeof r.candidateSource === 'string' ? r.candidateSource : null,
        scoreBreakdown:
          r.scoreBreakdown && typeof r.scoreBreakdown === 'object'
            ? (r.scoreBreakdown as Record<string, number>)
            : {},
        algorithmVersion:
          typeof r.algorithmVersion === 'string'
            ? r.algorithmVersion
            : RECOMMENDATION_ALGORITHM_VERSION,
        metadata: r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {},
      })
    }
    const result = await recordRecommendationEventsBatch(events, userId)
    return NextResponse.json({
      ok: true,
      recorded: result.ok ? result.data.inserted : 0,
      telemetryEnabled: true,
    })
  }

  const action = body.action as RecommendationAction
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }
  if (typeof body.eventId !== 'string' || !body.eventId.trim()) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  const event: RecommendationTelemetryEvent = {
    sessionId,
    eventId: body.eventId,
    action,
    position: typeof body.position === 'number' ? body.position : null,
    score: typeof body.score === 'number' ? body.score : null,
    candidateSource: typeof body.candidateSource === 'string' ? body.candidateSource : null,
    scoreBreakdown:
      body.scoreBreakdown && typeof body.scoreBreakdown === 'object'
        ? (body.scoreBreakdown as Record<string, number>)
        : {},
    algorithmVersion:
      typeof body.algorithmVersion === 'string'
        ? body.algorithmVersion
        : RECOMMENDATION_ALGORITHM_VERSION,
    metadata:
      body.metadata && typeof body.metadata === 'object'
        ? (body.metadata as Record<string, unknown>)
        : {},
  }

  const result = await recordRecommendationEvent(event, userId)
  return NextResponse.json({
    ok: true,
    recorded: result.ok ? result.data.inserted : 0,
    telemetryEnabled: true,
  })
}
