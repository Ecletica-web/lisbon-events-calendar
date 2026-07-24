/**
 * Lightweight unit checks — run: npx tsx qualification/__tests__/gates.selftest.ts
 */

import assert from 'node:assert/strict'
import { autoRepairEvent, isBadTicketUrl, fixTwentyFourHour } from '../auto-repair'
import { validateEvent, REASON } from '../validate-event'
import { isPublishAuthorized, isPublishSafe } from '../publish-safe'
import { calculateConfidence } from '../calculated-confidence'
import { mergeExtractions } from '../../intelligence/merge-extractions'
import { reconcilePostEvents } from '../reconcile-post-events'
import { computeFingerprint } from '../dedupe'
import type { ExtractedEvent, ExtractionResult } from '../../types'

function ev(partial: Partial<ExtractedEvent> & { title: string }): ExtractedEvent {
  return {
    tags: [],
    confidence_score: 0.9,
    extraction_source: 'caption',
    ...partial,
  }
}

// --- auto-repair ---
{
  const fixed = fixTwentyFourHour('2026-07-20T24:00:00')
  assert.equal(fixed.fixed, true)
  assert.ok(fixed.value.startsWith('2026-07-21T00:00'))

  const overnight = autoRepairEvent(
    ev({
      title: 'Club Night',
      start_datetime: '2026-08-01T23:00:00',
      end_datetime: '2026-08-01T03:00:00',
    })
  )
  assert.ok(overnight.repairs.includes('overnight_end_rollover'))
  assert.ok(overnight.event.end_datetime?.startsWith('2026-08-02'))

  const badUrl = autoRepairEvent(
    ev({ title: 'X', start_datetime: '2026-08-01T22:00:00', ticket_url: 'https://example.com/foo' })
  )
  assert.ok(badUrl.repairs.includes('cleared_placeholder_ticket_url'))
  assert.equal(badUrl.event.ticket_url, undefined)

  const freeConflict = autoRepairEvent(
    ev({ title: 'X', start_datetime: '2026-08-01T22:00:00', is_free: true, price_min: 5 })
  )
  assert.ok(freeConflict.repairs.includes('cleared_free_price_conflict'))
  assert.equal(freeConflict.event.is_free, undefined)

  assert.equal(isBadTicketUrl('https://shotgun.live/x'), false)
  assert.equal(isBadTicketUrl('not-a-url'), true)
}

// --- validate ---
{
  const future = '2099-06-15T22:00:00'
  const pass = validateEvent(ev({ title: 'Ok', start_datetime: future, venue_name_raw: 'Lux' }), {
    events_in_post: 1,
    venueResolved: true,
    now: new Date('2026-07-01'),
  })
  assert.equal(pass.status, 'pass')

  const past = validateEvent(ev({ title: 'Old', start_datetime: '2020-01-01T20:00:00', venue_name_raw: 'Lux' }), {
    events_in_post: 1,
    venueResolved: true,
    now: new Date('2026-07-01'),
  })
  assert.ok(past.reasons.includes(REASON.PAST_EVENT))

  const unresolved = validateEvent(ev({ title: 'Ok', start_datetime: future, venue_name_raw: 'Somewhere' }), {
    events_in_post: 1,
    venueResolved: false,
    now: new Date('2026-07-01'),
  })
  assert.ok(unresolved.reasons.includes(REASON.VENUE_UNRESOLVED))

  const endBefore = validateEvent(
    ev({
      title: 'Bad',
      start_datetime: future,
      end_datetime: '2099-06-15T20:00:00',
      venue_name_raw: 'Lux',
    }),
    { events_in_post: 1, venueResolved: true, now: new Date('2026-07-01') }
  )
  assert.ok(endBefore.reasons.includes(REASON.END_BEFORE_START))
}

// --- publish-safe ---
{
  const safe = isPublishSafe(
    {
      title: 'Night',
      start_datetime: '2099-06-15T22:00:00',
      venue_id: 'lux-fragil',
      ticket_url: '',
      is_free: '',
    },
    { now: new Date('2026-07-01') }
  )
  assert.equal(safe.safe, true)

  const unsafe = isPublishSafe(
    {
      title: 'Night',
      start_datetime: '2099-06-15T22:00:00',
      venue_id: '',
      ticket_url: 'https://example.com/x',
    },
    { now: new Date('2026-07-01') }
  )
  assert.equal(unsafe.safe, false)
  assert.ok(unsafe.reasons.includes('venue_unresolved'))
  assert.ok(unsafe.reasons.includes('bad_ticket_url'))
}

// --- publish authorized (Wave 5) ---
{
  const base = {
    title: 'Night',
    start_datetime: '2099-06-15T22:00:00',
    venue_id: 'lux-fragil',
    event_id: 'evt_1',
    publish_auth: '',
  }
  const blocked = isPublishAuthorized(base, {
    now: new Date('2026-07-01'),
    cleanVerifiedEventIds: new Set(),
  })
  assert.equal(blocked.authorized, false)
  assert.equal(blocked.unverified, true)

  const verified = isPublishAuthorized(base, {
    now: new Date('2026-07-01'),
    cleanVerifiedEventIds: new Set(['evt_1']),
  })
  assert.equal(verified.authorized, true)

  const human = isPublishAuthorized(
    { ...base, publish_auth: 'human_approved' },
    { now: new Date('2026-07-01'), cleanVerifiedEventIds: new Set() }
  )
  assert.equal(human.authorized, true)
}

// --- merge confidence ---
{
  const caption: ExtractionResult = {
    events: [
      ev({
        title: 'Show',
        start_datetime: '2099-06-15T22:00:00',
        venue_name_raw: 'Lux',
        is_free: false,
        price_min: 10,
        confidence_score: 0.95,
      }),
    ],
    raw_model_text: '',
  }
  const vision: ExtractionResult = {
    events: [
      ev({
        title: 'Show',
        start_datetime: '2099-06-16T22:00:00',
        venue_name_raw: 'Village',
        is_free: true,
        confidence_score: 1,
        extraction_source: 'vision',
      }),
    ],
    raw_model_text: '',
  }
  const merged = mergeExtractions(caption, vision)
  assert.ok(merged.conflicts.includes('date'))
  assert.ok(merged.conflicts.includes('venue'))
  assert.ok(merged.conflicts.includes('is_free'))
  assert.ok(merged.events[0].confidence_score < 0.95)
}

// --- reconcile lineup ---
{
  const reconciled = reconcilePostEvents([
    ev({ title: 'Lemonella', start_datetime: '2099-06-15T23:00:00', venue_name_raw: 'Rumu', confidence_score: 0.9 }),
    ev({ title: 'Miro', start_datetime: '2099-06-15T23:00:00', venue_name_raw: 'Rumu', confidence_score: 0.9 }),
  ])
  assert.equal(reconciled.length, 1)
}

// --- fingerprint with source ---
{
  const a = computeFingerprint('Show', '2099-06-15T23:10:00', 'unknown', 'post123')
  const b = computeFingerprint('Show', '2099-06-15T23:20:00', 'ven_1', 'post123')
  // Same post + same 30-min bucket + same title — venue key differs so fingerprints differ;
  // reconcile handles lineup; fingerprint still includes venue for safety
  assert.notEqual(a, b)
  const c = computeFingerprint('Show', '2099-06-15T23:10:00', 'ven_1', 'post123')
  const d = computeFingerprint('Show', '2099-06-15T23:20:00', 'ven_1', 'post123')
  assert.equal(c, d)
}

// --- calculated confidence ---
{
  const { score } = calculateConfidence(
    ev({ title: 'Ok Event', start_datetime: '2099-06-15T22:00:00', venue_name_raw: 'Lux', confidence_score: 1 }),
    { conflicts: ['date', 'venue'] }
  )
  assert.ok(score < 0.85)
}

console.log('gates.selftest.ts: all passed')
