/**
 * Thin For You recommendation API.
 * Ranking logic lives in recommendationEngine; telemetry is best-effort and additive.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { fetchEvents, toCanonicalTagKey } from '@/lib/eventsAdapter'
import { fetchUserInteractionsBulk } from '@/lib/interactions'
import {
  RECOMMENDATION_ALGORITHM_VERSION,
  getPersonalizedFeedScored,
  asColdStartRecommendations,
  type UserFeedContext,
  type PersonaWeights,
  type ScoredRecommendation,
} from '@/lib/recommendationEngine'
import {
  createRecommendationSession,
  isRecommendationTelemetryEnabled,
  primaryCandidateSource,
  type RecommendationSessionContext,
} from '@/lib/recommendationTelemetry'

/** Uses request.headers (Authorization) and user-specific data — must not be statically rendered */
export const dynamic = 'force-dynamic'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

const FOR_YOU_LIMIT = 50

/** Fisher–Yates shuffle; returns a new array. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Random sample of upcoming events when user has no follows/likes/persona/friends signal. */
function randomUpcoming(
  upcoming: Awaited<ReturnType<typeof fetchEvents>>,
  limit: number
): Awaited<ReturnType<typeof fetchEvents>> {
  if (upcoming.length <= limit) return upcoming
  return shuffle(upcoming).slice(0, limit)
}

/** True if the user has any signal we can use for personalization. */
function hasFeedSignals(
  bulk: Awaited<ReturnType<typeof import('@/lib/interactions').fetchUserInteractionsBulk>>,
  personaWeights: PersonaWeights | null,
  friendsGoingByEventId: Map<string, number>
): boolean {
  if (bulk.followedVenueIds.size > 0 || bulk.followedPromoterIds.size > 0) return true
  if (bulk.likedEventIds.size > 0 || bulk.wishlistedEventIds.size > 0) return true
  if (
    personaWeights?.includeTags?.length ||
    personaWeights?.includeCategories?.length ||
    personaWeights?.includeVenues?.length
  ) {
    return true
  }
  if (friendsGoingByEventId.size > 0) return true
  return false
}

function buildSessionContext(opts: {
  personaWeights: PersonaWeights | null
  personaId: string | null
  personaTitle: string | null
  coldStart: boolean
  hasSignals: boolean
}): RecommendationSessionContext {
  const now = new Date()
  const ctx: RecommendationSessionContext = {
    timezone: 'Europe/Lisbon',
    local_hour: ((now.getUTCHours() + 1) % 24), // coarse Lisbon CET-ish; do not invent DST
    weekday: now.getUTCDay(),
    cold_start: opts.coldStart,
    has_feed_signals: opts.hasSignals,
  }
  if (opts.personaId) ctx.persona_id = opts.personaId
  if (opts.personaTitle) ctx.persona_title = opts.personaTitle
  if (opts.personaWeights?.budget_range) {
    ctx.budget_min = opts.personaWeights.budget_range[0]
    ctx.budget_max = opts.personaWeights.budget_range[1]
  }
  if (opts.personaWeights?.neighborhoods?.length) {
    ctx.preferred_neighborhoods = opts.personaWeights.neighborhoods
  }
  if (opts.personaWeights?.time_preference) {
    ctx.preferred_time = opts.personaWeights.time_preference
  }
  return ctx
}

function toRecommendationItems(scored: ScoredRecommendation[]) {
  return scored.map((item) => ({
    eventId: item.event.id,
    score: item.score,
    position: item.position ?? null,
    candidateSources: item.candidateSources,
    candidateSource: primaryCandidateSource(item.candidateSources),
    scoreBreakdown: item.scoreBreakdown,
    reasons: item.reasons,
  }))
}

function legacyReasonsMap(scored: ScoredRecommendation[]): Record<string, string[]> {
  const reasons: Record<string, string[]> = {}
  scored.forEach((item) => {
    if (item.reasons.length) reasons[item.event.id] = item.reasons
  })
  return reasons
}

async function maybeCreateSession(opts: {
  userId: string | null
  personaId: string | null
  context: RecommendationSessionContext
}): Promise<string | null> {
  if (!isRecommendationTelemetryEnabled()) return null
  const result = await createRecommendationSession({
    userId: opts.userId,
    personaId: opts.personaId,
    surface: 'foryou',
    city: 'lisbon',
    context: opts.context,
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
  })
  if (!result.ok) {
    if (!result.skipped) {
      console.error('[foryou] recommendation session failed:', result.error)
    }
    return null
  }
  return result.data.sessionId
}

export async function GET(request: NextRequest) {
  const telemetryEnabled = isRecommendationTelemetryEnabled()
  const algorithmVersion = RECOMMENDATION_ALGORITHM_VERSION

  try {
    const bearer = getBearer(request)
    const personaRulesParam = request.nextUrl.searchParams.get('personaRules')
    const personaIdParam = request.nextUrl.searchParams.get('personaId')
    const personaTitleParam = request.nextUrl.searchParams.get('personaTitle')
    let personaWeights: PersonaWeights | null = null
    if (personaRulesParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(personaRulesParam)) as PersonaWeights
        personaWeights = {
          includeTags: parsed.includeTags,
          includeCategories: parsed.includeCategories,
          includeVenues: parsed.includeVenues,
          prefer_free: parsed.prefer_free,
          energy_level: parsed.energy_level,
          neighborhoods: parsed.neighborhoods,
          time_preference: parsed.time_preference,
          budget_range: parsed.budget_range,
        }
      } catch (_) {}
    }
    const personaId =
      typeof personaIdParam === 'string' && personaIdParam.trim() ? personaIdParam.trim().slice(0, 100) : null
    const personaTitle =
      typeof personaTitleParam === 'string' && personaTitleParam.trim()
        ? personaTitleParam.trim().slice(0, 120)
        : null

    const events = await fetchEvents()
    const upcoming = events.filter((e) => e.start >= new Date().toISOString())

    const respond = async (
      scored: ScoredRecommendation[],
      userId: string | null,
      coldStart: boolean,
      hasSignals: boolean
    ) => {
      const sessionId = await maybeCreateSession({
        userId,
        personaId,
        context: buildSessionContext({
          personaWeights,
          personaId,
          personaTitle,
          coldStart,
          hasSignals,
        }),
      })
      return NextResponse.json({
        events: scored.map((s) => s.event),
        reasons: legacyReasonsMap(scored),
        recommendationSessionId: sessionId,
        algorithmVersion,
        telemetryEnabled,
        recommendationItems: toRecommendationItems(scored),
      })
    }

    if (!bearer || !supabaseServer) {
      const cold = asColdStartRecommendations(randomUpcoming(upcoming, FOR_YOU_LIMIT))
      return respond(cold, null, true, false)
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser(bearer)
    if (authError || !user) {
      const cold = asColdStartRecommendations(randomUpcoming(upcoming, FOR_YOU_LIMIT))
      return respond(cold, null, true, false)
    }

    const userId = user.id
    const bulk = await fetchUserInteractionsBulk(userId)

    const { data: friendRows } = await supabaseServer
      .from('friend_requests')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)
    const friendIds = (friendRows || []).map((r) =>
      r.requester_id === userId ? r.addressee_id : r.requester_id
    )

    const friendsGoingByEventId = new Map<string, number>()
    if (friendIds.length > 0) {
      const { data: goingRows } = await supabaseServer
        .from('user_interactions')
        .select('entity_id, user_id')
        .eq('entity_type', 'event')
        .eq('interaction_type', 'going')
        .in('user_id', friendIds)
      const eventToCount = new Map<string, number>()
      goingRows?.forEach((r) => {
        const eid = (r.entity_id || '').toLowerCase().trim()
        eventToCount.set(eid, (eventToCount.get(eid) || 0) + 1)
      })
      eventToCount.forEach((count, eid) => friendsGoingByEventId.set(eid, count))
    }

    const likedCategories = new Set<string>()
    const likedEventIds = bulk.likedEventIds
    upcoming.forEach((e) => {
      if (likedEventIds.has(e.id) && e.extendedProps.category) {
        likedCategories.add(e.extendedProps.category.toLowerCase())
      }
    })

    const savedTagSet = new Set<string>()
    if (personaWeights?.includeTags?.length) {
      personaWeights.includeTags.forEach((t) => {
        const key = toCanonicalTagKey(t)
        if (key) savedTagSet.add(key)
      })
    }

    const ctx: UserFeedContext = {
      followedVenueIds: bulk.followedVenueIds,
      followedPromoterIds: bulk.followedPromoterIds,
      likedEventIds: bulk.likedEventIds,
      likedCategories,
      personaWeights,
      friendsGoingByEventId,
      savedTagSet,
      freeEventAttendenceScore: bulk.wishlistedEventIds.size > 0 ? 0.5 : 0,
    }

    const hasSignals = hasFeedSignals(bulk, personaWeights, friendsGoingByEventId)
    const scored = hasSignals
      ? getPersonalizedFeedScored(upcoming, ctx, { limit: FOR_YOU_LIMIT, upcomingOnly: true })
      : asColdStartRecommendations(randomUpcoming(upcoming, FOR_YOU_LIMIT))

    return respond(scored, userId, !hasSignals, hasSignals)
  } catch (e) {
    console.error('For You API error:', e)
    return NextResponse.json({
      events: [],
      reasons: {},
      recommendationSessionId: null,
      algorithmVersion,
      telemetryEnabled,
      recommendationItems: [],
    })
  }
}
