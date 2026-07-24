/**
 * POST /api/recommendations/impressions
 * Batch genuine impression telemetry. Never exposes stored rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import {
  assertSessionWritable,
  isRecommendationTelemetryEnabled,
  MAX_IMPRESSION_BATCH,
  recordRecommendationEventsBatch,
  type RecommendationTelemetryEvent,
} from '@/lib/recommendationTelemetry'
import { RECOMMENDATION_ALGORITHM_VERSION } from '@/lib/recommendationEngine'
import { checkRateLimit } from '@/lib/simpleRateLimit'

export const dynamic = 'force-dynamic'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

function clientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `uid:${userId}`
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return `ip:${fwd || 'anon'}`
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const bearer = getBearer(request)
  if (!bearer || !supabaseServer) return null
  const { data, error } = await supabaseServer.auth.getUser(bearer)
  if (error || !data.user) return null
  return data.user.id
}

type ImpressionBody = {
  eventId?: unknown
  position?: unknown
  score?: unknown
  candidateSource?: unknown
  scoreBreakdown?: unknown
  algorithmVersion?: unknown
}

export async function POST(request: NextRequest) {
  if (!isRecommendationTelemetryEnabled()) {
    return NextResponse.json({ ok: true, telemetryEnabled: false, recorded: 0 })
  }

  let body: { sessionId?: unknown; impressions?: unknown; user_id?: unknown; userId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Never trust client-supplied identity
  if (body.user_id != null || body.userId != null) {
    return NextResponse.json({ error: 'user_id must not be supplied by client' }, { status: 400 })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  if (!Array.isArray(body.impressions)) {
    return NextResponse.json({ error: 'impressions must be an array' }, { status: 400 })
  }
  if (body.impressions.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 })
  }
  if (body.impressions.length > MAX_IMPRESSION_BATCH) {
    return NextResponse.json(
      { error: `impressions batch exceeds max ${MAX_IMPRESSION_BATCH}` },
      { status: 400 }
    )
  }

  const userId = await resolveUserId(request)
  const rl = checkRateLimit(clientKey(request, userId), { limit: 120, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

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

  const algo = sessionCheck.data.algorithmVersion || RECOMMENDATION_ALGORITHM_VERSION

  const events: RecommendationTelemetryEvent[] = []
  for (const raw of body.impressions as ImpressionBody[]) {
    if (!raw || typeof raw !== 'object') continue
    if (typeof raw.eventId !== 'string' || !raw.eventId.trim()) continue
    events.push({
      sessionId,
      eventId: raw.eventId,
      action: 'impression',
      position: typeof raw.position === 'number' ? raw.position : null,
      score: typeof raw.score === 'number' ? raw.score : null,
      candidateSource: typeof raw.candidateSource === 'string' ? raw.candidateSource : null,
      scoreBreakdown:
        raw.scoreBreakdown && typeof raw.scoreBreakdown === 'object'
          ? (raw.scoreBreakdown as Record<string, number>)
          : {},
      algorithmVersion:
        typeof raw.algorithmVersion === 'string' ? raw.algorithmVersion : algo,
      metadata: {},
    })
  }

  const result = await recordRecommendationEventsBatch(events, userId)
  if (!result.ok && !result.skipped) {
    console.error('[impressions] record failed:', result.error)
    return NextResponse.json({ ok: false, recorded: 0 })
  }

  return NextResponse.json({
    ok: true,
    recorded: result.ok ? result.data.inserted : 0,
    telemetryEnabled: true,
  })
}
