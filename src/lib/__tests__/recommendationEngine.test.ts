/**
 * Ranking equivalence + score breakdown tests for rules_v1.
 * Embeds the pre-telemetry score formula to prove numerical identity.
 */

import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '../eventsAdapter'
import {
  RECOMMENDATION_ALGORITHM_VERSION,
  scoreEvent,
  scoreEventDetailed,
  getPersonalizedFeed,
  getPersonalizedFeedScored,
  asColdStartRecommendations,
  sumScoreBreakdown,
  type UserFeedContext,
  type PersonaWeights,
} from '../recommendationEngine'

/** Legacy scoreEvent body (pre-breakdown) — must stay bitwise identical in behaviour. */
function legacyScoreEvent(event: NormalizedEvent, ctx: UserFeedContext): number {
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
  const normId = (s: string | undefined) => (s || '').toLowerCase().trim()
  const toCanonicalTagKey = (t: string) => t.toLowerCase().trim()

  function eventMatchesPersona(ev: NormalizedEvent, persona: PersonaWeights): boolean {
    if (persona.includeTags?.length) {
      const match = persona.includeTags.some((t) =>
        ev.extendedProps.tags.some((et) => toCanonicalTagKey(et) === toCanonicalTagKey(t))
      )
      if (!match) return false
    }
    if (persona.includeCategories?.length && ev.extendedProps.category) {
      const cat = (ev.extendedProps.category || '').toLowerCase()
      if (!persona.includeCategories.some((c) => c.toLowerCase() === cat)) return false
    }
    if (persona.includeVenues?.length) {
      const vk = ev.extendedProps.venueKey || ev.extendedProps.venueId || ''
      if (!persona.includeVenues.some((v) => normId(v) === normId(vk))) return false
    }
    return true
  }

  function energyBoost(ev: NormalizedEvent, level: 'high' | 'medium' | 'low'): number {
    if (level !== 'high') return 0
    const cat = (ev.extendedProps.category || '').toLowerCase()
    const tags = ev.extendedProps.tags.map((t) => t.toLowerCase())
    const highEnergy = ['music', 'electronic', 'techno', 'club', 'rave', 'party', 'concert', 'dj']
    if (highEnergy.some((h) => cat.includes(h) || tags.some((t) => t.includes(h)))) return SCORE.ENERGY_HIGH_BOOST
    return 0
  }

  let score = 0
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

  if (venueId && ctx.followedVenueIds.has(venueId)) score += SCORE.FOLLOW_VENUE
  if (promoterIds.some((id) => ctx.followedPromoterIds.has(id))) score += SCORE.FOLLOW_PROMOTER
  if (ctx.personaWeights && eventMatchesPersona(event, ctx.personaWeights)) {
    score += SCORE.PERSONA_MATCH
    score += energyBoost(event, ctx.personaWeights.energy_level || 'medium')
  }
  const friendIds = event.extendedProps.mergedEventIds?.length
    ? event.extendedProps.mergedEventIds
    : [event.id]
  const friendCount = friendIds.reduce((n, id) => n + (ctx.friendsGoingByEventId.get(id) || 0), 0)
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

function makeEvent(partial: {
  id: string
  start: string
  venueId?: string
  promoterId?: string
  category?: string
  tags?: string[]
  isFree?: boolean
}): NormalizedEvent {
  return {
    id: partial.id,
    title: partial.id,
    start: partial.start,
    extendedProps: {
      venueId: partial.venueId,
      venueKey: partial.venueId,
      venueName: partial.venueId || 'Venue',
      promoterId: partial.promoterId,
      promoterName: partial.promoterId,
      category: partial.category || '',
      tags: partial.tags || [],
      isFree: partial.isFree ?? false,
      descriptionShort: '',
      descriptionLong: '',
      imageUrl: '',
      imageUrls: [],
      status: 'scheduled',
    },
  } as NormalizedEvent
}

describe('recommendationEngine rules_v1', () => {
  it('exports canonical algorithm version once', () => {
    expect(RECOMMENDATION_ALGORITHM_VERSION).toBe('rules_v1')
  })

  const ctx: UserFeedContext = {
    followedVenueIds: new Set(['lux']),
    followedPromoterIds: new Set(['resident']),
    likedEventIds: new Set(),
    likedCategories: new Set(['music']),
    personaWeights: {
      includeTags: ['techno'],
      energy_level: 'high',
      prefer_free: true,
    },
    friendsGoingByEventId: new Map([['e2', 2]]),
    savedTagSet: new Set(['techno']),
    freeEventAttendenceScore: 0.5,
  }

  const events = [
    makeEvent({
      id: 'e1',
      start: '2099-06-01T22:00:00.000Z',
      venueId: 'lux',
      promoterId: 'resident',
      category: 'music',
      tags: ['techno'],
      isFree: true,
    }),
    makeEvent({
      id: 'e2',
      start: '2099-06-02T22:00:00.000Z',
      venueId: 'other',
      category: 'art',
      tags: [],
    }),
    makeEvent({
      id: 'e3',
      start: '2099-05-01T22:00:00.000Z',
      venueId: 'lux',
      category: 'music',
      tags: ['jazz'],
    }),
  ]

  it('scoreEvent matches legacy score for the same inputs', () => {
    for (const ev of events) {
      expect(scoreEvent(ev, ctx)).toBe(legacyScoreEvent(ev, ctx))
    }
  })

  it('score breakdown sums to final score', () => {
    for (const ev of events) {
      const detailed = scoreEventDetailed(ev, ctx)
      expect(sumScoreBreakdown(detailed.scoreBreakdown)).toBe(detailed.score)
      expect(detailed.score).toBe(legacyScoreEvent(ev, ctx))
    }
  })

  it('preserves ranking order and tie-break by start ascending', () => {
    const legacyOrder = [...events]
      .map((event) => ({ event, score: legacyScoreEvent(event, ctx) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return new Date(a.event.start).getTime() - new Date(b.event.start).getTime()
      })
      .map((x) => x.event.id)

    const newOrder = getPersonalizedFeed(events, ctx, { upcomingOnly: false }).map((e) => e.id)
    const scoredOrder = getPersonalizedFeedScored(events, ctx, { upcomingOnly: false }).map(
      (s) => s.event.id
    )

    expect(newOrder).toEqual(legacyOrder)
    expect(scoredOrder).toEqual(legacyOrder)
  })

  it('candidate sources match contributing signals', () => {
    const d = scoreEventDetailed(events[0], ctx)
    expect(d.candidateSources).toContain('followed_venue')
    expect(d.candidateSources).toContain('followed_promoter')
    expect(d.candidateSources).toContain('persona_match')
    expect(d.candidateSources).toContain('saved_tag')
    expect(d.candidateSources).toContain('liked_category')
    expect(d.candidateSources).toContain('free_preference')
    expect(d.scoreBreakdown.followedVenue).toBe(10)
    expect(d.scoreBreakdown.followedPromoter).toBe(8)
  })

  it('cold-start attribution does not change event list', () => {
    const cold = asColdStartRecommendations(events)
    expect(cold.map((c) => c.event.id)).toEqual(events.map((e) => e.id))
    expect(cold.every((c) => c.candidateSources.includes('cold_start'))).toBe(true)
    expect(cold.every((c) => c.score === 0)).toBe(true)
  })

  it('friend going contributes fixed weight regardless of friend count', () => {
    const d = scoreEventDetailed(events[1], ctx)
    expect(d.scoreBreakdown.friendGoing).toBe(5)
    expect(d.candidateSources).toContain('friend_activity')
  })
})
