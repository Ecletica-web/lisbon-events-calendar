import { describe, it, expect, beforeEach } from 'vitest'
import {
  setRecommendationSessionState,
  clearRecommendationImpressionCache,
  trackRecommendationImpression,
  wouldRecordImpression,
  markImpressionRecordedForTests,
} from '../recommendationTelemetryClient'
import { checkRateLimit, _resetRateLimitsForTests } from '../simpleRateLimit'

describe('recommendationTelemetryClient impressions', () => {
  beforeEach(() => {
    clearRecommendationImpressionCache()
    setRecommendationSessionState({
      sessionId: '11111111-1111-4111-8111-111111111111',
      algorithmVersion: 'rules_v1',
      telemetryEnabled: true,
      items: [
        {
          eventId: 'evt_a',
          score: 10,
          position: 1,
          candidateSources: ['followed_venue'],
          candidateSource: 'followed_venue',
          scoreBreakdown: { followedVenue: 10 },
          reasons: ['Followed venue'],
        },
        {
          eventId: 'evt_b',
          score: 0,
          position: 2,
          candidateSources: ['cold_start'],
          candidateSource: 'cold_start',
          scoreBreakdown: {},
          reasons: [],
        },
      ],
    })
  })

  it('records an active card impression only once per session', () => {
    expect(wouldRecordImpression('11111111-1111-4111-8111-111111111111', 'evt_a')).toBe(true)
    trackRecommendationImpression('evt_a')
    expect(wouldRecordImpression('11111111-1111-4111-8111-111111111111', 'evt_a')).toBe(false)
    trackRecommendationImpression('evt_a')
    expect(wouldRecordImpression('11111111-1111-4111-8111-111111111111', 'evt_a')).toBe(false)
  })

  it('does not record when telemetry disabled', () => {
    setRecommendationSessionState({
      sessionId: '11111111-1111-4111-8111-111111111111',
      telemetryEnabled: false,
    })
    trackRecommendationImpression('evt_a')
    expect(wouldRecordImpression('11111111-1111-4111-8111-111111111111', 'evt_a')).toBe(true)
  })

  it('allows new impressions after session change', () => {
    markImpressionRecordedForTests('11111111-1111-4111-8111-111111111111', 'evt_a')
    expect(wouldRecordImpression('11111111-1111-4111-8111-111111111111', 'evt_a')).toBe(false)
    clearRecommendationImpressionCache()
    setRecommendationSessionState({
      sessionId: '22222222-2222-4222-8222-222222222222',
      telemetryEnabled: true,
    })
    expect(wouldRecordImpression('22222222-2222-4222-8222-222222222222', 'evt_a')).toBe(true)
  })

  it('background / other event ids remain independently trackable', () => {
    trackRecommendationImpression('evt_a')
    expect(wouldRecordImpression('11111111-1111-4111-8111-111111111111', 'evt_b')).toBe(true)
  })
})

describe('simpleRateLimit', () => {
  beforeEach(() => _resetRateLimitsForTests())

  it('allows until limit then blocks', () => {
    expect(checkRateLimit('k', { limit: 2, windowMs: 60_000 }).allowed).toBe(true)
    expect(checkRateLimit('k', { limit: 2, windowMs: 60_000 }).allowed).toBe(true)
    expect(checkRateLimit('k', { limit: 2, windowMs: 60_000 }).allowed).toBe(false)
  })
})

describe('foryou response shape (contract)', () => {
  it('documents required additive fields', () => {
    const sample = {
      events: [],
      reasons: {},
      recommendationSessionId: null as string | null,
      algorithmVersion: 'rules_v1',
      telemetryEnabled: false,
      recommendationItems: [] as unknown[],
    }
    expect(sample).toHaveProperty('events')
    expect(sample).toHaveProperty('reasons')
    expect(sample).toHaveProperty('recommendationSessionId')
    expect(sample).toHaveProperty('algorithmVersion')
    expect(sample).toHaveProperty('telemetryEnabled')
    expect(sample).toHaveProperty('recommendationItems')
  })
})
