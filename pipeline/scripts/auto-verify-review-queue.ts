/**
 * Tier 5 on pending review-queue rows: verify → apply suggestions → auto-approve
 * when verification confidence > threshold and mechanical gates pass.
 *
 * Skips empty extractions rows (`no_events_extracted`) — nothing to verify.
 *
 *   npx tsx scripts/auto-verify-review-queue.ts                 # dry-run (limit 20)
 *   npx tsx scripts/auto-verify-review-queue.ts --apply         # write
 *   npx tsx scripts/auto-verify-review-queue.ts --apply --limit=0  # all verifiable
 *   npx tsx scripts/auto-verify-review-queue.ts --min-confidence=0.8
 */

import {
  isVerifyQuotaError,
  toVerificationLogRow,
  verifyProcessedEvent,
  type SuggestedCorrections,
} from '../intelligence/event-verification'
import { autoRepairEvent } from '../qualification/auto-repair'
import { computeFingerprint } from '../qualification/dedupe'
import { normalizeCategory } from '../qualification/normalize-category'
import { validateEvent } from '../qualification/validate-event'
import { clearVenueResolveCache, resolveEventVenue } from '../qualification/venue-resolve'
import { appendProcessed } from '../sinks/sheets-writer'
import {
  appendVerifications,
  getSupabaseStore,
  isSupabaseStoreConfigured,
  listPendingReviewQueue,
  resolveReviewQueueItems,
} from '../sinks/supabase-store'
import type { ExtractedEvent, ProcessedEventRow } from '../types'

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limitRaw = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : apply ? 0 : 20
const limit = Number.isFinite(limitRaw) ? limitRaw : 20
const confArg = process.argv.find((a) => a.startsWith('--min-confidence='))
const minConfidence = confArg
  ? Math.min(1, Math.max(0, parseFloat(confArg.slice('--min-confidence='.length)) || 0.8))
  : 0.8

const SKIP_REASONS = new Set(['no_events_extracted'])

function reasonsList(raw: unknown): string[] {
  return String(raw || '')
    .split(/[|;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function isVerifiable(r: Record<string, unknown>): boolean {
  const reasons = reasonsList(r.validation_reasons)
  if (reasons.some((x) => SKIP_REASONS.has(x))) return false
  const title = String(r.description_short || '').trim()
  const start = String(r.start_datetime || '').trim()
  if (!title || title === 'Untitled') return false
  if (!start) return false
  const d = new Date(start)
  if (isNaN(d.getTime())) return false
  return true
}

function rowToExtracted(r: Record<string, unknown>): ExtractedEvent {
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
    end_datetime: undefined,
    venue_name_raw: String(r.venue_name_raw || '') || undefined,
    ticket_url: undefined,
    confidence_score: parseFloat(String(r.confidence_score || '0.7')) || 0.7,
    tags: [],
    extraction_source: 'merged',
  }
}

function applyCorrections(event: ExtractedEvent, corr: SuggestedCorrections): ExtractedEvent {
  const next = { ...event }
  if (corr.title?.trim()) {
    next.title = corr.title.trim()
    next.description_short = corr.title.trim()
  }
  if (corr.start_datetime?.trim()) next.start_datetime = corr.start_datetime.trim()
  if (corr.end_datetime?.trim()) next.end_datetime = corr.end_datetime.trim()
  if (corr.venue_name_raw?.trim()) next.venue_name_raw = corr.venue_name_raw.trim()
  if (corr.ticket_url?.trim()) next.ticket_url = corr.ticket_url.trim()
  if (corr.status?.trim()) {
    // status lives on Processed row; stash via age_restriction unused — handled below
  }
  return next
}

function toVerifyRow(
  r: Record<string, unknown>,
  event: ExtractedEvent,
  venueName: string
): ProcessedEventRow {
  const owner = String(r.owner_username || r.source_name || '')
  const start = event.start_datetime || String(r.start_datetime || '')
  return {
    event_id: `evt_reviewverify_${String(r.review_id || '').slice(0, 12)}`,
    source_name: owner,
    source_event_id: String(r.source_event_id || ''),
    sources: owner,
    source_count: '1',
    source_url: String(r.source_url || ''),
    dedupe_key: '',
    fingerprint: '',
    title: event.title,
    description_short: event.description_short ?? event.title,
    description_long: event.description_long ?? '',
    start_datetime: start,
    end_datetime: event.end_datetime ?? '',
    timezone: 'Europe/Lisbon',
    is_all_day: 'false',
    status: 'scheduled',
    venue_id: '',
    venue_name: venueName,
    venue_name_raw: event.venue_name_raw ?? venueName,
    venue_address: '',
    neighborhood: '',
    city: 'Lisboa',
    country: 'Portugal',
    latitude: '',
    longitude: '',
    category: event.category ?? '',
    tags: (event.tags || []).join('|'),
    price_min: event.price_min != null ? String(event.price_min) : '',
    price_max: event.price_max != null ? String(event.price_max) : '',
    currency: event.currency ?? '',
    is_free: event.is_free != null ? String(event.is_free) : '',
    age_restriction: event.age_restriction ?? '',
    language: '',
    ticket_url: event.ticket_url ?? '',
    primary_image_url: String(r.stored_image_url || r.thumbnail_url || ''),
    confidence_score: String(event.confidence_score),
    first_seen_at: '',
    last_seen_at: '',
    changed_at: '',
    created_at: '',
    updated_at: '',
    _raw_model_text: '',
    post_pattern: '',
    extraction_source: event.extraction_source,
    on_slide_text_evidence: event.on_slide_text_evidence ?? '',
    publish_auth: '',
  }
}

async function patchReviewRow(
  reviewId: string,
  patch: Record<string, unknown>,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return
  const sb = getSupabaseStore()
  const { error } = await sb.from('pipeline_review_queue').update(patch).eq('review_id', reviewId)
  if (error) throw new Error(`patch review ${reviewId}: ${error.message}`)
}

async function main(): Promise<void> {
  if (!isSupabaseStoreConfigured()) {
    console.error('[auto-verify-review] Supabase not configured')
    process.exit(1)
  }

  clearVenueResolveCache()
  const now = new Date()
  const pending = await listPendingReviewQueue()
  const verifiable = pending.filter(isVerifiable)
  const skippedEmpty = pending.length - verifiable.length
  const work =
    limit > 0 ? verifiable.slice(0, limit) : verifiable

  console.log(
    `[auto-verify-review] pending=${pending.length} verifiable=${verifiable.length} skip_empty=${skippedEmpty} ` +
      `work=${work.length} min_confidence=${minConfidence} mode=${apply ? 'APPLY' : 'dry-run'}`
  )

  const stats = {
    verified_ok: 0,
    approved: 0,
    patched_only: 0,
    skipped_low_conf: 0,
    skipped_not_found: 0,
    skipped_gates: 0,
    errors: 0,
  }

  for (const r of work) {
    const reviewId = String(r.review_id || '')
    if (!reviewId) continue

    try {
      let event = autoRepairEvent(rowToExtracted(r)).event
      const owner = String(r.owner_username || r.source_name || '')
      const verifyInput = toVerifyRow(r, event, event.venue_name_raw || '')
      const result = await verifyProcessedEvent(verifyInput)
      const corr = result.suggested_corrections || {}
      const corrKeys = Object.keys(corr).filter((k) => (corr as Record<string, string>)[k]?.trim())

      console.log(
        `  - ${event.title.slice(0, 60)} | ${result.verdict} conf=${result.confidence.toFixed(2)} ` +
          `corr=[${corrKeys.join(',')}]`
      )

      const logRow = toVerificationLogRow(verifyInput, result)
      if (apply) {
        await appendVerifications([logRow], false)
      }

      event = applyCorrections(event, corr)
      if (corr.status?.trim() === 'cancelled' || corr.status?.trim() === 'postponed') {
        await patchReviewRow(
          reviewId,
          {
            verification_verdict: result.verdict,
            verification_notes: result.notes,
            suggested_corrections: JSON.stringify(corr),
            description_short: event.title,
            start_datetime: event.start_datetime || null,
            venue_name_raw: event.venue_name_raw || null,
            description_long: event.description_long || null,
          },
          !apply
        )
        stats.patched_only++
        console.log(`    keep pending (status suggestion ${corr.status})`)
        continue
      }

      const repaired0 = autoRepairEvent(event).event
      // Tier 5 confidence stands in for extraction score when auto-approving.
      const repaired: ExtractedEvent = {
        ...repaired0,
        confidence_score: Math.max(repaired0.confidence_score || 0, result.confidence),
      }
      const venue = await resolveEventVenue(repaired.venue_name_raw, '', owner, {
        sourceType: 'promoter',
      })
      const validation = validateEvent(repaired, {
        events_in_post: 1,
        venueResolved: venue.resolved,
        now,
        city: venue.city,
      })

      await patchReviewRow(
        reviewId,
        {
          verification_verdict: result.verdict,
          verification_notes: result.notes,
          suggested_corrections: corrKeys.length ? JSON.stringify(corr) : '',
          description_short: repaired.title,
          start_datetime: repaired.start_datetime || null,
          venue_name_raw: repaired.venue_name_raw || null,
          description_long: repaired.description_long || null,
          confidence_score: String(repaired.confidence_score),
        },
        !apply
      )

      if (result.confidence < minConfidence) {
        stats.skipped_low_conf++
        console.log(`    keep pending (confidence ${result.confidence.toFixed(2)} < ${minConfidence})`)
        continue
      }

      if (result.verdict === 'not_found') {
        stats.skipped_not_found++
        console.log(`    keep pending (not_found — never auto-approve)`)
        continue
      }

      if (!venue.resolved || validation.status !== 'pass') {
        stats.skipped_gates++
        console.log(
          `    keep pending (gates: venue=${venue.resolved} status=${validation.status} ${validation.reasons.join('|')})`
        )
        continue
      }

      const start = repaired.start_datetime!
      const fp = computeFingerprint(
        repaired.title,
        start,
        venue.venue_id,
        String(r.source_event_id || r.source_url || '')
      )
      const ts = now.toISOString()
      const processed: ProcessedEventRow = {
        event_id: `evt_t5auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        source_name: owner || 'tier5-auto',
        source_event_id: String(r.source_event_id || ''),
        sources: owner,
        source_count: '1',
        source_url: String(r.source_url || ''),
        dedupe_key: '',
        fingerprint: fp,
        title: repaired.title,
        description_short: repaired.description_short ?? repaired.title,
        description_long: repaired.description_long ?? '',
        start_datetime: start,
        end_datetime: repaired.end_datetime ?? '',
        timezone: 'Europe/Lisbon',
        is_all_day: 'false',
        status: 'scheduled',
        venue_id: venue.venue_id,
        venue_name: venue.venue_name,
        venue_name_raw: repaired.venue_name_raw ?? '',
        venue_address: venue.venue_address ?? '',
        neighborhood: venue.neighborhood ?? '',
        city: venue.city || 'Lisboa',
        country: 'Portugal',
        latitude: '',
        longitude: '',
        category: normalizeCategory(repaired.category) || repaired.category || '',
        tags: (repaired.tags || []).join('|'),
        price_min: repaired.price_min != null ? String(repaired.price_min) : '',
        price_max: repaired.price_max != null ? String(repaired.price_max) : '',
        currency: repaired.currency ?? '',
        is_free: repaired.is_free != null ? String(repaired.is_free) : '',
        age_restriction: repaired.age_restriction ?? '',
        language: '',
        ticket_url: repaired.ticket_url ?? '',
        primary_image_url: String(r.stored_image_url || r.thumbnail_url || ''),
        confidence_score: String(repaired.confidence_score),
        first_seen_at: ts,
        last_seen_at: ts,
        changed_at: ts,
        created_at: ts,
        updated_at: ts,
        _raw_model_text: result.raw_model_text.slice(0, 8000),
        post_pattern: '',
        extraction_source: repaired.extraction_source,
        on_slide_text_evidence: repaired.on_slide_text_evidence ?? '',
        publish_auth: 'human_approved',
      }

      if (apply) {
        await appendProcessed([processed], false)
        await resolveReviewQueueItems([reviewId], 'approved', 'tier5-auto-approve')
      }
      stats.verified_ok++
      stats.approved++
      console.log(
        `    APPROVE → ${venue.venue_name} (${venue.venue_id}) [${result.verdict} ${result.confidence.toFixed(2)}]`
      )
    } catch (err) {
      stats.errors++
      console.error(
        `  ! error ${String(r.description_short || '').slice(0, 40)}:`,
        err instanceof Error ? err.message : err
      )
      if (isVerifyQuotaError(err)) {
        console.error('[auto-verify-review] OpenAI quota exhausted — stopping')
        break
      }
    }
  }

  console.log('[auto-verify-review] done', stats)
  if (!apply) {
    console.log('[auto-verify-review] re-run with --apply to write Processed + approve reviews')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
