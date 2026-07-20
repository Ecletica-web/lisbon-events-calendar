/**
 * One-off backfill: Google Sheets Events_Raw / Needs_Review / Verification_Log / Run_Log → Supabase.
 *
 *   cd pipeline && npm run backfill
 *
 * Processed Events and Watchlist stay in Sheets (not migrated).
 */

import { getConfig } from '../config'
import { readTabSafe, TAB_EVENTS_RAW, TAB_NEEDS_REVIEW, TAB_VERIFICATION, TAB_RUN_LOG } from '../sinks/sheets-writer'
import {
  appendReviewQueue,
  appendVerifications,
  getSupabaseStore,
  isSupabaseStoreConfigured,
  upsertPipelinePosts,
} from '../sinks/supabase-store'
import type { EventsRawRow, NeedsReviewRow, VerificationLogRow } from '../types'

function asRaw(r: Record<string, string>): EventsRawRow {
  return {
    id: r.id || r.source_event_id || `backfill_${Math.random().toString(36).slice(2)}`,
    source_name: (r.source_name as 'instagram') || 'instagram',
    source_event_id: r.source_event_id || '',
    source_url: r.source_url || '',
    owner_username: r.owner_username || '',
    owner_id: r.owner_id || '',
    owner_full_name: r.owner_full_name || '',
    caption: r.caption || '',
    posted_at: r.posted_at || '',
    scraped_at: r.scraped_at || '',
    run_id: r.run_id || '',
    location_id: r.location_id || '',
    location_name: r.location_name || '',
    location_address: r.location_address || '',
    latitude: r.latitude || '',
    longitude: r.longitude || '',
    media_type: (r.media_type as EventsRawRow['media_type']) || 'unknown',
    media_urls: r.media_urls || '',
    thumbnail_url: r.thumbnail_url || '',
    permalink: r.permalink || '',
    hashtags: r.hashtags || '',
    mentions: r.mentions || '',
    external_links: r.external_links || '',
    like_count: r.like_count || '',
    comment_count: r.comment_count || '',
    stored_image_url: r.stored_image_url || '',
    image_status: r.image_status || '',
    image_storage_path: r.image_storage_path || '',
    image_error: r.image_error || '',
    shortCode: r.shortCode || '',
    displayUrl: r.displayUrl || '',
    carousel_slide_urls: r.carousel_slide_urls || '',
    archived_slide_urls: r.archived_slide_urls || '',
    video_url: r.video_url || '',
    raw_json: r.raw_json || '',
    created_at: r.created_at || '',
    updated_at: r.updated_at || '',
  }
}

function asReview(r: Record<string, string>): NeedsReviewRow {
  return {
    review_id: r.review_id || `rev_backfill_${Math.random().toString(36).slice(2)}`,
    source_name: r.source_name || '',
    source_event_id: r.source_event_id || '',
    source_url: r.source_url || '',
    owner_username: r.owner_username || '',
    caption: r.caption || '',
    description_short: r.description_short || '',
    description_long: r.description_long || '',
    validation_status: r.validation_status || '',
    validation_reasons: r.validation_reasons || '',
    confidence_score: r.confidence_score || '',
    start_datetime: r.start_datetime || '',
    venue_name_raw: r.venue_name_raw || '',
    route: r.route || 'needs_review',
    _raw_caption_ai_text: r._raw_caption_ai_text || '',
    raw_model_text: r.raw_model_text || '',
    created_at: r.created_at || new Date().toISOString(),
    thumbnail_url: r.thumbnail_url || '',
    stored_image_url: r.stored_image_url || '',
    image_storage_path: r.image_storage_path || '',
    image_error: r.image_error || '',
    verification_verdict: r.verification_verdict || '',
    verification_notes: r.verification_notes || '',
    verification_sources: r.verification_sources || '',
    suggested_corrections: r.suggested_corrections || '',
  }
}

function asVerification(r: Record<string, string>): VerificationLogRow {
  return {
    event_id: r.event_id || '',
    title: r.title || '',
    start_datetime: r.start_datetime || '',
    venue_name: r.venue_name || '',
    source_url: r.source_url || '',
    verdict: r.verdict || '',
    confidence: r.confidence || '',
    title_ok: r.title_ok || '',
    datetime_ok: r.datetime_ok || '',
    venue_ok: r.venue_ok || '',
    notes: r.notes || '',
    suggested_corrections: r.suggested_corrections || '',
    sources: r.sources || '',
    verified_at: r.verified_at || '',
    raw_model_text: r.raw_model_text || '',
  }
}

async function chunked<T>(items: T[], size: number, fn: (batch: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size))
    console.log(`  … ${Math.min(i + size, items.length)}/${items.length}`)
  }
}

async function main(): Promise<void> {
  getConfig()
  if (!isSupabaseStoreConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  }

  console.log('[backfill] Events_Raw → pipeline_posts')
  const raw = (await readTabSafe(TAB_EVENTS_RAW)).filter((r) => (r.source_event_id || '').trim())
  await chunked(raw, 50, async (batch) => {
    await upsertPipelinePosts(batch.map(asRaw), false)
  })

  console.log('[backfill] Needs_Review → pipeline_review_queue')
  const review = (await readTabSafe(TAB_NEEDS_REVIEW)).filter((r) => (r.review_id || '').trim())
  await chunked(review, 50, async (batch) => {
    await appendReviewQueue(batch.map(asReview), false)
  })

  console.log('[backfill] Verification_Log → pipeline_verifications')
  const ver = (await readTabSafe(TAB_VERIFICATION)).filter((r) => (r.event_id || '').trim())
  await chunked(ver, 50, async (batch) => {
    await appendVerifications(batch.map(asVerification), false)
  })

  console.log('[backfill] Run_Log → pipeline_runs (historical, status=success|error)')
  const sb = getSupabaseStore()
  const runs = await readTabSafe(TAB_RUN_LOG)
  await chunked(runs, 50, async (batch) => {
    const payload = batch.map((r) => ({
      mode: (r.mode === 'extract' || r.mode === 'verify' || r.mode === 'full' ? r.mode : 'scrape') as
        | 'scrape'
        | 'extract'
        | 'verify'
        | 'full',
      status: (r.status === 'error' ? 'error' : 'success') as 'success' | 'error',
      params: { handles: r.handles, legacy_run_id: r.run_id },
      stats: {
        posts_scraped: Number(r.posts_scraped) || 0,
        new_rows: Number(r.new_rows) || 0,
      },
      apify_run_id: r.apify_run_id || null,
      requested_by: 'backfill',
      log: r.error || '',
      started_at: r.started_at || null,
      finished_at: r.finished_at || null,
    }))
    const { error } = await sb.from('pipeline_runs').insert(payload)
    if (error) throw new Error(error.message)
  })

  console.log('[backfill] done')
}

main().catch((err) => {
  console.error('[backfill] failed:', err)
  process.exitCode = 1
})
