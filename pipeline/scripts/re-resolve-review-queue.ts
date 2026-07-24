/**
 * Re-resolve pending review rows blocked mainly by venue_unresolved.
 * After Fontes/Venues catalog updates, newly resolving future events auto-promote
 * to Processed with publish_auth=human_approved (catalog fix, not model trust).
 *
 *   npx tsx scripts/re-resolve-review-queue.ts
 *   npx tsx scripts/re-resolve-review-queue.ts --apply
 */

import { autoRepairEvent } from '../qualification/auto-repair'
import { validateEvent } from '../qualification/validate-event'
import { resolveEventVenue, clearVenueResolveCache } from '../qualification/venue-resolve'
import { computeFingerprint } from '../qualification/dedupe'
import { normalizeCategory } from '../qualification/normalize-category'
import { appendProcessed } from '../sinks/sheets-writer'
import {
  isSupabaseStoreConfigured,
  listPendingReviewQueue,
  resolveReviewQueueItems,
} from '../sinks/supabase-store'
import type { ExtractedEvent, ProcessedEventRow } from '../types'

const apply = process.argv.includes('--apply')

function onlyVenueGap(reasons: string): boolean {
  const parts = reasons
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p !== 'quarantine')
  if (parts.length === 0) return false
  return parts.every((p) => p === 'venue_unresolved' || p === 'missing_venue_name_raw')
}

function rowToEvent(r: Record<string, unknown>): ExtractedEvent {
  const raw = r._raw_caption_ai_text ? String(r._raw_caption_ai_text) : ''
  try {
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as ExtractedEvent
      if (parsed?.title) return { ...parsed, tags: parsed.tags || [] }
    }
  } catch {
    /* fall through */
  }
  return {
    title: String(r.description_short || 'Untitled').trim() || 'Untitled',
    description_short: String(r.description_short || ''),
    description_long: String(r.description_long || ''),
    start_datetime: String(r.start_datetime || '') || undefined,
    venue_name_raw: String(r.venue_name_raw || '') || undefined,
    confidence_score: parseFloat(String(r.confidence_score || '0.8')) || 0.8,
    tags: [],
    extraction_source: 'merged',
  }
}

async function main(): Promise<void> {
  if (!isSupabaseStoreConfigured()) {
    console.error('[re-resolve] Supabase not configured')
    process.exit(1)
  }
  clearVenueResolveCache()
  const now = new Date()
  const pending = await listPendingReviewQueue()
  const candidates = pending.filter((r) => onlyVenueGap(String(r.validation_reasons ?? '')))

  console.log(
    `[re-resolve] pending=${pending.length} venue_gap_only=${candidates.length} mode=${apply ? 'APPLY' : 'dry-run'}`
  )

  const promoted: ProcessedEventRow[] = []
  const promoteIds: string[] = []

  for (const r of candidates) {
    const event0 = rowToEvent(r)
    const { event } = autoRepairEvent(event0)
    const owner = String(r.owner_username || r.source_name || '')
    const venue = await resolveEventVenue(event.venue_name_raw, '', owner, {
      sourceType: 'promoter', // never owner-fallback during recovery of extracted names
    })
    // Retry as venue type only if no extracted name
    const venue2 =
      venue.resolved || event.venue_name_raw?.trim()
        ? venue
        : await resolveEventVenue(event.venue_name_raw, '', owner, { sourceType: 'venue' })

    const resolved = venue2.resolved ? venue2 : venue
    if (!resolved.resolved) {
      console.log(`  skip unresolved: ${event.title} / ${event.venue_name_raw}`)
      continue
    }

    const validation = validateEvent(event, {
      events_in_post: 1,
      venueResolved: true,
      now,
      city: resolved.city,
    })
    if (validation.status !== 'pass') {
      console.log(`  skip still failing (${validation.reasons.join('|')}): ${event.title}`)
      continue
    }

    const start = event.start_datetime!
    const fp = computeFingerprint(
      event.title,
      start,
      resolved.venue_id,
      String(r.source_event_id || r.source_url || '')
    )
    const ts = now.toISOString()
    const row: ProcessedEventRow = {
      event_id: `evt_reresolve_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source_name: owner || 're-resolve',
      source_event_id: String(r.source_event_id || ''),
      sources: owner,
      source_count: '1',
      source_url: String(r.source_url || ''),
      dedupe_key: '',
      fingerprint: fp,
      title: event.title,
      description_short: event.description_short ?? '',
      description_long: event.description_long ?? '',
      start_datetime: start,
      end_datetime: event.end_datetime ?? '',
      timezone: 'Europe/Lisbon',
      is_all_day: 'false',
      status: 'scheduled',
      venue_id: resolved.venue_id,
      venue_name: resolved.venue_name,
      venue_name_raw: event.venue_name_raw ?? '',
      venue_address: resolved.venue_address ?? '',
      neighborhood: resolved.neighborhood ?? '',
      city: resolved.city || 'Lisboa',
      country: 'Portugal',
      latitude: '',
      longitude: '',
      category: normalizeCategory(event.category) || event.category || '',
      tags: (event.tags || []).join('|'),
      price_min: event.price_min != null ? String(event.price_min) : '',
      price_max: event.price_max != null ? String(event.price_max) : '',
      currency: event.currency ?? '',
      is_free: event.is_free != null ? String(event.is_free) : '',
      age_restriction: event.age_restriction ?? '',
      language: '',
      ticket_url: event.ticket_url ?? '',
      primary_image_url: String(r.stored_image_url || ''),
      confidence_score: String(event.confidence_score),
      first_seen_at: ts,
      last_seen_at: ts,
      changed_at: ts,
      created_at: ts,
      updated_at: ts,
      _raw_model_text: '',
      post_pattern: '',
      extraction_source: event.extraction_source,
      on_slide_text_evidence: event.on_slide_text_evidence ?? '',
      publish_auth: 'human_approved',
    }
    promoted.push(row)
    promoteIds.push(String(r.review_id))
    console.log(`  promote: ${event.title} → ${resolved.venue_name} (${resolved.venue_id})`)
  }

  console.log(`[re-resolve] would_promote=${promoted.length}`)
  if (!apply) {
    console.log('[re-resolve] re-run with --apply to append Processed + resolve review items')
    return
  }

  if (promoted.length) {
    await appendProcessed(promoted, false)
    await resolveReviewQueueItems(promoteIds, 'approved', 're-resolve-review-queue')
  }
  console.log(`[re-resolve] appended=${promoted.length} approved_reviews=${promoteIds.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
