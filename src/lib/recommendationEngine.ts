/**
 * Scoring engine for "For You" feed.
 * Rule-based production ranking — do not change weights without a new algorithm version.
 * Telemetry / score breakdowns are additive and must preserve numerical score + order.
 */

import type { NormalizedEvent } from './eventsAdapter'
import { toCanonicalTagKey } from './eventsAdapter'

/** Canonical version for the current rule-based recommender. Do not duplicate this string. */
export const RECOMMENDATION_ALGORITHM_VERSION = 'rules_v1'

export interface PersonaWeights {
  prefer_free?: boolean
  energy_level?: 'low' | 'medium' | 'high'
  budget_range?: [number, number]
  neighborhoods?: string[]
  time_preference?: 'day' | 'night' | 'late'
  includeTags?: string[]
  includeCategories?: string[]
  includeVenues?: string[]
}

export interface UserFeedContext {
  followedVenueIds: Set<string>
  followedPromoterIds: Set<string>
  likedEventIds: Set<string>
  likedCategories: Set<string>
  personaWeights?: PersonaWeights | null
  friendsGoingByEventId: Map<string, number>
  savedTagSet: Set<string>
  freeEventAttendenceScore?: number
}

export type CandidateSource =
  | 'followed_venue'
  | 'followed_promoter'
  | 'persona_match'
  | 'friend_activity'
  | 'saved_tag'
  | 'liked_category'
  | 'free_preference'
  | 'cold_start'
  | 'rules'

export type RecommendationScoreBreakdown = {
  followedVenue: number
  followedPromoter: number
  personaMatch: number
  energyBoost: number
  friendGoing: number
  savedTag: number
  likedCategory: number
  freePreference: number
}

export type ScoredRecommendation = {
  event: NormalizedEvent
  score: number
  scoreBreakdown: RecommendationScoreBreakdown
  candidateSources: CandidateSource[]
  reasons: string[]
  position?: number
}

const SCORE = {
  FOLLOW_VENUE: 10,
  FOLLOW_PROMOTER: 8,
  PERSONA_MATCH: 6,
  FRIEND_GOING: 5,
  SAVED_TAG: 4,
  LIKED_CATEGORY: 3,
  FREE_PREF: 2,
  ENERGY_HIGH_BOOST: 2,
}

const EMPTY_BREAKDOWN: RecommendationScoreBreakdown = {
  followedVenue: 0,
  followedPromoter: 0,
  personaMatch: 0,
  energyBoost: 0,
  friendGoing: 0,
  savedTag: 0,
  likedCategory: 0,
  freePreference: 0,
}

function normId(s: string | undefined): string {
  return (s || '').toLowerCase().trim()
}

export function sumScoreBreakdown(breakdown: RecommendationScoreBreakdown): number {
  return (
    breakdown.followedVenue +
    breakdown.followedPromoter +
    breakdown.personaMatch +
    breakdown.energyBoost +
    breakdown.friendGoing +
    breakdown.savedTag +
    breakdown.likedCategory +
    breakdown.freePreference
  )
}

function eventMatchesPersona(event: NormalizedEvent, persona: PersonaWeights): boolean {
  if (persona.includeTags?.length) {
    const match = persona.includeTags.some((t) =>
      event.extendedProps.tags.some((et) => toCanonicalTagKey(et) === toCanonicalTagKey(t))
    )
    if (!match) return false
  }
  if (persona.includeCategories?.length && event.extendedProps.category) {
    const cat = (event.extendedProps.category || '').toLowerCase()
    if (!persona.includeCategories.some((c) => c.toLowerCase() === cat)) return false
  }
  if (persona.includeVenues?.length) {
    const vk = event.extendedProps.venueKey || event.extendedProps.venueId || ''
    if (!persona.includeVenues.some((v) => normId(v) === normId(vk))) return false
  }
  return true
}

function energyBoost(event: NormalizedEvent, level: 'high' | 'medium' | 'low'): number {
  if (level !== 'high') return 0
  const cat = (event.extendedProps.category || '').toLowerCase()
  const tags = event.extendedProps.tags.map((t) => t.toLowerCase())
  const highEnergy = ['music', 'electronic', 'techno', 'club', 'rave', 'party', 'concert', 'dj']
  if (highEnergy.some((h) => cat.includes(h) || tags.some((t) => t.includes(h)))) return SCORE.ENERGY_HIGH_BOOST
  return 0
}

function friendGoingCount(event: NormalizedEvent, ctx: UserFeedContext): number {
  const friendIds = event.extendedProps.mergedEventIds?.length
    ? event.extendedProps.mergedEventIds
    : [event.id]
  return friendIds.reduce((n, id) => n + (ctx.friendsGoingByEventId.get(id) || 0), 0)
}

function buildReasons(
  breakdown: RecommendationScoreBreakdown,
  friendCount: number
): string[] {
  const r: string[] = []
  if (breakdown.followedVenue > 0) r.push('Followed venue')
  if (breakdown.followedPromoter > 0) r.push('Followed promoter')
  if (breakdown.personaMatch > 0) r.push('Matches your vibe')
  if (breakdown.friendGoing > 0) {
    r.push(`${friendCount} friend${friendCount !== 1 ? 's' : ''} going`)
  }
  if (breakdown.freePreference > 0) r.push('Free event')
  if (breakdown.likedCategory > 0) r.push('Because you liked similar events')
  if (breakdown.savedTag > 0 && !r.includes('Matches your vibe')) r.push('Saved tag match')
  return r
}

/** Score components for one event. Final score is the sum of breakdown values. */
export function scoreEventDetailed(
  event: NormalizedEvent,
  ctx: UserFeedContext
): Omit<ScoredRecommendation, 'event' | 'position'> {
  const breakdown: RecommendationScoreBreakdown = { ...EMPTY_BREAKDOWN }
  const candidateSources: CandidateSource[] = []

  const venueId = normId(event.extendedProps.venueId || event.extendedProps.venueKey || '')
  const promoterIds = [
    event.extendedProps.promoterId,
    event.extendedProps.promoterName,
    ...(event.extendedProps.promoterIds || []),
    ...(event.extendedProps.nightActs || []).flatMap((a) => [a.promoterId, a.promoterName]),
  ]
    .filter((s): s is string => !!s)
    .map(normId)
    .filter(Boolean)

  if (venueId && ctx.followedVenueIds.has(venueId)) {
    breakdown.followedVenue = SCORE.FOLLOW_VENUE
    candidateSources.push('followed_venue')
  }
  if (promoterIds.some((id) => ctx.followedPromoterIds.has(id))) {
    breakdown.followedPromoter = SCORE.FOLLOW_PROMOTER
    candidateSources.push('followed_promoter')
  }
  if (ctx.personaWeights && eventMatchesPersona(event, ctx.personaWeights)) {
    breakdown.personaMatch = SCORE.PERSONA_MATCH
    breakdown.energyBoost = energyBoost(event, ctx.personaWeights.energy_level || 'medium')
    candidateSources.push('persona_match')
  }
  const friendCount = friendGoingCount(event, ctx)
  if (friendCount > 0) {
    breakdown.friendGoing = SCORE.FRIEND_GOING
    candidateSources.push('friend_activity')
  }
  if (event.extendedProps.tags.some((t) => ctx.savedTagSet.has(toCanonicalTagKey(t)))) {
    breakdown.savedTag = SCORE.SAVED_TAG
    candidateSources.push('saved_tag')
  }
  if (event.extendedProps.category && ctx.likedCategories.has(event.extendedProps.category.toLowerCase())) {
    breakdown.likedCategory = SCORE.LIKED_CATEGORY
    candidateSources.push('liked_category')
  }
  if (event.extendedProps.isFree && (ctx.personaWeights?.prefer_free || (ctx.freeEventAttendenceScore ?? 0) > 0.3)) {
    breakdown.freePreference = SCORE.FREE_PREF
    candidateSources.push('free_preference')
  }

  if (candidateSources.length === 0) {
    candidateSources.push('rules')
  }

  const score = sumScoreBreakdown(breakdown)
  return {
    score,
    scoreBreakdown: breakdown,
    candidateSources,
    reasons: buildReasons(breakdown, friendCount),
  }
}

/** Total score only — numerically identical to previous scoreEvent. */
export function scoreEvent(event: NormalizedEvent, ctx: UserFeedContext): number {
  return scoreEventDetailed(event, ctx).score
}

function sortScored(a: ScoredRecommendation, b: ScoredRecommendation): number {
  if (b.score !== a.score) return b.score - a.score
  return new Date(a.event.start).getTime() - new Date(b.event.start).getTime()
}

/** Ranked feed with score metadata. Order matches getPersonalizedFeed. */
export function getPersonalizedFeedScored(
  events: NormalizedEvent[],
  ctx: UserFeedContext,
  options: { limit?: number; upcomingOnly?: boolean } = {}
): ScoredRecommendation[] {
  const { limit = 50, upcomingOnly = true } = options
  const now = new Date().toISOString()

  let list = events
  if (upcomingOnly) {
    list = events.filter((e) => e.start >= now)
  }

  const withScores: ScoredRecommendation[] = list.map((event) => {
    const detailed = scoreEventDetailed(event, ctx)
    return { event, ...detailed }
  })

  withScores.sort(sortScored)

  return withScores.slice(0, limit).map((item, index) => ({
    ...item,
    position: index + 1,
  }))
}

export function getPersonalizedFeed(
  events: NormalizedEvent[],
  ctx: UserFeedContext,
  options: { limit?: number; upcomingOnly?: boolean } = {}
): NormalizedEvent[] {
  return getPersonalizedFeedScored(events, ctx, options).map((x) => x.event)
}

/** Cold-start items: preserve given order; attribute as cold_start. */
export function asColdStartRecommendations(
  events: NormalizedEvent[]
): ScoredRecommendation[] {
  return events.map((event, index) => ({
    event,
    score: 0,
    scoreBreakdown: { ...EMPTY_BREAKDOWN },
    candidateSources: ['cold_start'] as CandidateSource[],
    reasons: [],
    position: index + 1,
  }))
}
