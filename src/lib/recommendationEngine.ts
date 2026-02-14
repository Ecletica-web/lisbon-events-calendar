/**
 * Scoring engine for "For You" feed. Swap with ML later.
 */

import type { NormalizedEvent } from './eventsAdapter'
import { toCanonicalTagKey } from './eventsAdapter'

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

function normId(s: string | undefined): string {
  return (s || '').toLowerCase().trim()
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

export function scoreEvent(event: NormalizedEvent, ctx: UserFeedContext): number {
  let score = 0
  const venueId = normId(event.extendedProps.venueId || event.extendedProps.venueKey || '')
  const promoterId = normId(event.extendedProps.promoterId || event.extendedProps.promoterName || '')

  if (venueId && ctx.followedVenueIds.has(venueId)) score += SCORE.FOLLOW_VENUE
  if (promoterId && ctx.followedPromoterIds.has(promoterId)) score += SCORE.FOLLOW_PROMOTER
  if (ctx.personaWeights && eventMatchesPersona(event, ctx.personaWeights)) {
    score += SCORE.PERSONA_MATCH
    score += energyBoost(event, ctx.personaWeights.energy_level || 'medium')
  }
  const friendCount = ctx.friendsGoingByEventId.get(event.id) || 0
  if (friendCount > 0) score += SCORE.FRIEND_GOING
  if (event.extendedProps.tags.some((t) => ctx.savedTagSet.has(toCanonicalTagKey(t)))) score += SCORE.SAVED_TAG
  if (event.extendedProps.category && ctx.likedCategories.has(event.extendedProps.category.toLowerCase())) {
    score += SCORE.LIKED_CATEGORY
  }
  if (event.extendedProps.isFree && (ctx.personaWeights?.prefer_free || (ctx.freeEventAttendenceScore ?? 0) > 0.3)) {
    score += SCORE.FREE_PREF
  }

  return score
}

export function getPersonalizedFeed(
  events: NormalizedEvent[],
  ctx: UserFeedContext,
  options: { limit?: number; upcomingOnly?: boolean } = {}
): NormalizedEvent[] {
  const { limit = 50, upcomingOnly = true } = options
  const now = new Date().toISOString()

  let list = events
  if (upcomingOnly) {
    list = events.filter((e) => e.start >= now)
  }

  const withScores = list.map((event) => ({
    event,
    score: scoreEvent(event, ctx),
  }))

  withScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return new Date(a.event.start).getTime() - new Date(b.event.start).getTime()
  })

  return withScores.slice(0, limit).map((x) => x.event)
}
