/**
 * Supabase sink for high-volume pipeline data (posts, extractions, review, verify, runs).
 * Watchlist + Processed Events remain in Google Sheets (see sheets-writer.ts).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getConfig } from '../config'
import type {
  EventsRawRow,
  NeedsReviewRow,
  VerificationLogRow,
} from '../types'

export type ProcessingStatus = 'new' | 'discarded' | 'needs_review' | 'processed'
export type ExtractionTier =
  | 'pre_filter'
  | 'caption'
  | 'vision'
  | 'ocr'
  | 'video_transcript'
  | 'merge'
  | 'validation'

export type PipelineRunMode = 'scrape' | 'extract' | 'verify' | 'full' | 'profile-images'
export type PipelineRunStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'abort_requested'
  | 'aborted'

let client: SupabaseClient | null = null

export function isSupabaseStoreConfigured(): boolean {
  const cfg = getConfig()
  return !!(cfg.SUPABASE_URL && cfg.SUPABASE_SERVICE_ROLE_KEY)
}

export function getSupabaseStore(): SupabaseClient {
  if (!client) {
    const cfg = getConfig()
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — required for pipeline store. See pipeline/.env.example'
      )
    }
    client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  }
  return client
}

function parseOptionalTs(value: string | undefined | null): string | null {
  if (!value || !String(value).trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function rawRowToDb(row: EventsRawRow): Record<string, unknown> {
  let rawJson: unknown = null
  if (row.raw_json?.trim()) {
    try {
      rawJson = JSON.parse(row.raw_json)
    } catch {
      rawJson = { _unparsed: row.raw_json.slice(0, 50000) }
    }
  }
  return {
    source_name: row.source_name || 'instagram',
    source_event_id: row.source_event_id,
    source_url: row.source_url || null,
    owner_username: row.owner_username || null,
    owner_id: row.owner_id || null,
    owner_full_name: row.owner_full_name || null,
    caption: row.caption || null,
    posted_at: parseOptionalTs(row.posted_at),
    scraped_at: parseOptionalTs(row.scraped_at),
    run_id: row.run_id || null,
    location_id: row.location_id || null,
    location_name: row.location_name || null,
    location_address: row.location_address || null,
    latitude: row.latitude || null,
    longitude: row.longitude || null,
    media_type: row.media_type || null,
    media_urls: row.media_urls || null,
    thumbnail_url: row.thumbnail_url || null,
    permalink: row.permalink || null,
    hashtags: row.hashtags || null,
    mentions: row.mentions || null,
    external_links: row.external_links || null,
    like_count: row.like_count || null,
    comment_count: row.comment_count || null,
    stored_image_url: row.stored_image_url || null,
    image_status: row.image_status || null,
    image_storage_path: row.image_storage_path || null,
    image_error: row.image_error || null,
    short_code: row.shortCode || null,
    display_url: row.displayUrl || null,
    carousel_slide_urls: row.carousel_slide_urls || null,
    archived_slide_urls: row.archived_slide_urls || null,
    video_url: row.video_url || null,
    raw_json: rawJson,
    processing_status: 'new' as ProcessingStatus,
    updated_at: new Date().toISOString(),
  }
}

export async function upsertPipelinePosts(
  rows: EventsRawRow[],
  dryRun = false
): Promise<{ written: number; idsBySourceEventId: Map<string, string> }> {
  const idsBySourceEventId = new Map<string, string>()
  if (rows.length === 0) return { written: 0, idsBySourceEventId }
  if (dryRun || !isSupabaseStoreConfigured()) {
    for (const r of rows) idsBySourceEventId.set(r.source_event_id, `dry_${r.source_event_id}`)
    return { written: rows.length, idsBySourceEventId }
  }

  const sb = getSupabaseStore()
  const payload = rows.map(rawRowToDb)
  const { data, error } = await sb
    .from('pipeline_posts')
    .upsert(payload, { onConflict: 'source_event_id' })
    .select('id, source_event_id')

  if (error) throw new Error(`pipeline_posts upsert failed: ${error.message}`)
  for (const row of data ?? []) {
    idsBySourceEventId.set(row.source_event_id, row.id)
  }
  return { written: data?.length ?? 0, idsBySourceEventId }
}

export async function readExistingPipelineSourceIds(): Promise<Set<string>> {
  if (!isSupabaseStoreConfigured()) return new Set()
  const sb = getSupabaseStore()
  const ids = new Set<string>()
  let from = 0
  const page = 1000
  for (;;) {
    const { data, error } = await sb
      .from('pipeline_posts')
      .select('source_event_id')
      .range(from, from + page - 1)
    if (error) throw new Error(`readExistingPipelineSourceIds: ${error.message}`)
    if (!data?.length) break
    for (const r of data) {
      if (r.source_event_id) ids.add(r.source_event_id)
    }
    if (data.length < page) break
    from += page
  }
  return ids
}

export async function readPendingPipelinePosts(options?: {
  handle?: string
  limit?: number
}): Promise<Array<EventsRawRow & { _db_id: string }>> {
  if (!isSupabaseStoreConfigured()) return []
  const sb = getSupabaseStore()
  let q = sb
    .from('pipeline_posts')
    .select('*')
    .eq('processing_status', 'new')
    .order('posted_at', { ascending: false, nullsFirst: false })

  if (options?.handle) q = q.eq('owner_username', options.handle)
  if (options?.limit) q = q.limit(options.limit)

  const { data, error } = await q
  if (error) throw new Error(`readPendingPipelinePosts: ${error.message}`)

  return (data ?? []).map((r) => dbPostToRawRow(r))
}

function dbPostToRawRow(r: Record<string, unknown>): EventsRawRow & { _db_id: string } {
  return {
    _db_id: String(r.id),
    id: String(r.id),
    source_name: (r.source_name as 'instagram') || 'instagram',
    source_event_id: String(r.source_event_id ?? ''),
    source_url: String(r.source_url ?? ''),
    owner_username: String(r.owner_username ?? ''),
    owner_id: String(r.owner_id ?? ''),
    owner_full_name: String(r.owner_full_name ?? ''),
    caption: String(r.caption ?? ''),
    posted_at: r.posted_at ? String(r.posted_at) : '',
    scraped_at: r.scraped_at ? String(r.scraped_at) : '',
    run_id: String(r.run_id ?? ''),
    location_id: String(r.location_id ?? ''),
    location_name: String(r.location_name ?? ''),
    location_address: String(r.location_address ?? ''),
    latitude: String(r.latitude ?? ''),
    longitude: String(r.longitude ?? ''),
    media_type: (r.media_type as EventsRawRow['media_type']) || 'unknown',
    media_urls: String(r.media_urls ?? ''),
    thumbnail_url: String(r.thumbnail_url ?? ''),
    permalink: String(r.permalink ?? ''),
    hashtags: String(r.hashtags ?? ''),
    mentions: String(r.mentions ?? ''),
    external_links: String(r.external_links ?? ''),
    like_count: String(r.like_count ?? ''),
    comment_count: String(r.comment_count ?? ''),
    stored_image_url: String(r.stored_image_url ?? ''),
    image_status: String(r.image_status ?? ''),
    image_storage_path: String(r.image_storage_path ?? ''),
    image_error: String(r.image_error ?? ''),
    shortCode: String(r.short_code ?? ''),
    displayUrl: String(r.display_url ?? ''),
    carousel_slide_urls: String(r.carousel_slide_urls ?? ''),
    archived_slide_urls: String(r.archived_slide_urls ?? ''),
    video_url: String(r.video_url ?? ''),
    raw_json: r.raw_json != null ? JSON.stringify(r.raw_json) : '',
    created_at: r.created_at ? String(r.created_at) : '',
    updated_at: r.updated_at ? String(r.updated_at) : '',
  }
}

export async function updatePostProcessingStatus(
  postId: string,
  status: ProcessingStatus,
  dryRun = false
): Promise<void> {
  if (dryRun || !isSupabaseStoreConfigured() || postId.startsWith('dry_')) return
  const sb = getSupabaseStore()
  const { error } = await sb
    .from('pipeline_posts')
    .update({ processing_status: status, updated_at: new Date().toISOString() })
    .eq('id', postId)
  if (error) throw new Error(`updatePostProcessingStatus: ${error.message}`)
}

export type RequeuePostOptions = {
  handle?: string
  /** Statuses to reset (default: processed, needs_review, discarded) */
  statuses?: ProcessingStatus[]
  /** Only posts with posted_at >= now − N days */
  postedSinceDays?: number
  /** Only posts with scraped_at >= now − N days */
  scrapedSinceDays?: number
  limit?: number
  dryRun?: boolean
}

/**
 * Set matching pipeline_posts back to status=new so extract / Nemotron / Tier 5 can run again.
 */
export async function requeuePipelinePosts(
  options: RequeuePostOptions = {}
): Promise<{ matched: number; requeued: number }> {
  if (!isSupabaseStoreConfigured()) return { matched: 0, requeued: 0 }
  const sb = getSupabaseStore()
  const statuses: ProcessingStatus[] =
    options.statuses && options.statuses.length > 0
      ? options.statuses
      : ['processed', 'needs_review', 'discarded']

  let q = sb
    .from('pipeline_posts')
    .select('id, owner_username, posted_at', { count: 'exact' })
    .in('processing_status', statuses)
    .order('posted_at', { ascending: false, nullsFirst: false })

  if (options.handle) {
    q = q.ilike('owner_username', options.handle.replace(/^@/, ''))
  }
  if (options.postedSinceDays != null && options.postedSinceDays > 0) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - options.postedSinceDays)
    q = q.gte('posted_at', d.toISOString())
  }
  if (options.scrapedSinceDays != null && options.scrapedSinceDays > 0) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - options.scrapedSinceDays)
    q = q.gte('scraped_at', d.toISOString())
  }

  const { data, error, count } = await q
  if (error) throw new Error(`requeuePipelinePosts select: ${error.message}`)
  const matched = count ?? (data?.length ?? 0)

  let selected = data ?? []
  if (options.limit && options.limit > 0) {
    const counts = new Map<string, number>()
    const kept: typeof selected = []
    for (const row of selected) {
      const h = String(row.owner_username || '')
        .replace(/^@/, '')
        .toLowerCase() || '_unknown'
      const n = counts.get(h) ?? 0
      if (n >= options.limit) continue
      counts.set(h, n + 1)
      kept.push(row)
    }
    selected = kept
  }

  const ids = selected.map((r) => String(r.id))
  if (ids.length === 0 || options.dryRun) {
    return { matched, requeued: options.dryRun ? ids.length : 0 }
  }

  // Update in chunks (PostgREST URL length)
  let requeued = 0
  const chunkSize = 200
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data: updated, error: upErr } = await sb
      .from('pipeline_posts')
      .update({ processing_status: 'new', updated_at: new Date().toISOString() })
      .in('id', chunk)
      .select('id')
    if (upErr) throw new Error(`requeuePipelinePosts update: ${upErr.message}`)
    requeued += updated?.length ?? chunk.length
  }
  return { matched, requeued }
}

export async function insertExtraction(params: {
  postId: string
  tier: ExtractionTier
  model?: string
  parsedJson?: unknown
  rawModelText?: string
  dryRun?: boolean
}): Promise<void> {
  if (params.dryRun || !isSupabaseStoreConfigured() || params.postId.startsWith('dry_')) return
  const sb = getSupabaseStore()
  const { error } = await sb.from('pipeline_extractions').insert({
    post_id: params.postId,
    tier: params.tier,
    model: params.model ?? null,
    parsed_json: params.parsedJson ?? null,
    raw_model_text: params.rawModelText?.slice(0, 100000) ?? null,
  })
  if (error) throw new Error(`insertExtraction (${params.tier}): ${error.message}`)
}

export async function appendReviewQueue(
  rows: NeedsReviewRow[],
  dryRun = false
): Promise<number> {
  if (rows.length === 0) return 0
  if (dryRun || !isSupabaseStoreConfigured()) return rows.length

  const sb = getSupabaseStore()
  const payload = rows.map((r) => ({
    review_id: r.review_id,
    source_name: r.source_name || null,
    source_event_id: r.source_event_id || null,
    source_url: r.source_url || null,
    owner_username: r.owner_username || null,
    caption: r.caption || null,
    description_short: r.description_short || null,
    description_long: r.description_long || null,
    validation_status: r.validation_status || null,
    validation_reasons: r.validation_reasons || null,
    confidence_score: r.confidence_score || null,
    start_datetime: r.start_datetime || null,
    venue_name_raw: r.venue_name_raw || null,
    route: r.route || null,
    raw_caption_ai_text: r._raw_caption_ai_text || null,
    raw_model_text: r.raw_model_text || null,
    thumbnail_url: r.thumbnail_url || null,
    stored_image_url: r.stored_image_url || null,
    image_storage_path: r.image_storage_path || null,
    image_error: r.image_error || null,
    verification_verdict: r.verification_verdict || null,
    verification_notes: r.verification_notes || null,
    verification_sources: r.verification_sources || null,
    suggested_corrections: r.suggested_corrections || null,
    review_status: 'pending',
  }))

  const { data, error } = await sb
    .from('pipeline_review_queue')
    .upsert(payload, { onConflict: 'review_id' })
    .select('id')
  if (error) throw new Error(`appendReviewQueue: ${error.message}`)
  return data?.length ?? 0
}

export async function appendVerifications(
  rows: VerificationLogRow[],
  dryRun = false
): Promise<number> {
  if (rows.length === 0) return 0
  if (dryRun || !isSupabaseStoreConfigured()) return rows.length

  const sb = getSupabaseStore()
  const payload = rows.map((r) => ({
    event_id: r.event_id,
    title: r.title || null,
    start_datetime: r.start_datetime || null,
    venue_name: r.venue_name || null,
    source_url: r.source_url || null,
    verdict: r.verdict || null,
    confidence: r.confidence || null,
    title_ok: r.title_ok || null,
    datetime_ok: r.datetime_ok || null,
    venue_ok: r.venue_ok || null,
    notes: r.notes || null,
    suggested_corrections: r.suggested_corrections || null,
    sources: r.sources || null,
    verified_at: parseOptionalTs(r.verified_at),
    raw_model_text: r.raw_model_text || null,
  }))

  const { data, error } = await sb
    .from('pipeline_verifications')
    .upsert(payload, { onConflict: 'event_id' })
    .select('id')
  if (error) throw new Error(`appendVerifications: ${error.message}`)
  return data?.length ?? 0
}

export async function readVerifiedEventIdsFromStore(): Promise<Set<string>> {
  if (!isSupabaseStoreConfigured()) return new Set()
  const sb = getSupabaseStore()
  const ids = new Set<string>()
  let from = 0
  const page = 1000
  for (;;) {
    const { data, error } = await sb
      .from('pipeline_verifications')
      .select('event_id')
      .range(from, from + page - 1)
    if (error) throw new Error(`readVerifiedEventIdsFromStore: ${error.message}`)
    if (!data?.length) break
    for (const r of data) if (r.event_id) ids.add(r.event_id)
    if (data.length < page) break
    from += page
  }
  return ids
}

export async function readRoutedSourceEventIds(): Promise<Set<string>> {
  if (!isSupabaseStoreConfigured()) return new Set()
  const sb = getSupabaseStore()
  const ids = new Set<string>()

  const { data: posts, error: pe } = await sb
    .from('pipeline_posts')
    .select('source_event_id')
    .in('processing_status', ['discarded', 'needs_review', 'processed'])
  if (pe) throw new Error(`readRoutedSourceEventIds posts: ${pe.message}`)
  for (const r of posts ?? []) if (r.source_event_id) ids.add(r.source_event_id)

  const { data: reviews, error: re } = await sb
    .from('pipeline_review_queue')
    .select('source_event_id')
  if (re) throw new Error(`readRoutedSourceEventIds review: ${re.message}`)
  for (const r of reviews ?? []) if (r.source_event_id) ids.add(r.source_event_id)

  return ids
}

// ---- Runs (job queue) ----

export interface PipelineRunRow {
  id: string
  mode: PipelineRunMode
  status: PipelineRunStatus
  params: Record<string, unknown>
  stats: Record<string, unknown>
  apify_run_id: string | null
  requested_by: string | null
  log: string
  heartbeat_at: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export async function createPipelineRun(params: {
  mode: PipelineRunMode
  runParams?: Record<string, unknown>
  requestedBy?: string
  status?: PipelineRunStatus
}): Promise<string | null> {
  if (!isSupabaseStoreConfigured()) return null
  const sb = getSupabaseStore()
  const { data, error } = await sb
    .from('pipeline_runs')
    .insert({
      mode: params.mode,
      status: params.status ?? 'queued',
      params: params.runParams ?? {},
      requested_by: params.requestedBy ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createPipelineRun: ${error.message}`)
  return data.id
}

export async function claimNextQueuedRun(): Promise<PipelineRunRow | null> {
  if (!isSupabaseStoreConfigured()) return null
  const sb = getSupabaseStore()
  const { data: queued, error } = await sb
    .from('pipeline_runs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`claimNextQueuedRun select: ${error.message}`)
  if (!queued) return null

  const now = new Date().toISOString()
  const { data: claimed, error: ue } = await sb
    .from('pipeline_runs')
    .update({
      status: 'running',
      started_at: now,
      heartbeat_at: now,
    })
    .eq('id', queued.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()
  if (ue) throw new Error(`claimNextQueuedRun claim: ${ue.message}`)
  return claimed as PipelineRunRow | null
}

export async function appendRunLogLine(runId: string, line: string): Promise<void> {
  if (!isSupabaseStoreConfigured()) return
  const sb = getSupabaseStore()
  const { data } = await sb.from('pipeline_runs').select('log').eq('id', runId).single()
  const prev = data?.log ?? ''
  const next = `${prev}${prev ? '\n' : ''}[${new Date().toISOString()}] ${line}`
  await sb
    .from('pipeline_runs')
    .update({ log: next.slice(-200000), heartbeat_at: new Date().toISOString() })
    .eq('id', runId)
}

export async function updatePipelineRun(
  runId: string,
  patch: Partial<{
    status: PipelineRunStatus
    stats: Record<string, unknown>
    apify_run_id: string
    log: string
    started_at: string
    finished_at: string
    heartbeat_at: string
  }>
): Promise<void> {
  if (!isSupabaseStoreConfigured()) return
  const sb = getSupabaseStore()
  const { error } = await sb
    .from('pipeline_runs')
    .update({ ...patch, heartbeat_at: patch.heartbeat_at ?? new Date().toISOString() })
    .eq('id', runId)
  if (error) throw new Error(`updatePipelineRun: ${error.message}`)
}

export async function isAbortRequested(runId: string): Promise<boolean> {
  if (!isSupabaseStoreConfigured()) return false
  const sb = getSupabaseStore()
  const { data } = await sb.from('pipeline_runs').select('status').eq('id', runId).single()
  return data?.status === 'abort_requested'
}

export class PipelineAbortedError extends Error {
  readonly runId: string
  constructor(runId: string) {
    super(`Pipeline run aborted (${runId.slice(0, 8)})`)
    this.name = 'PipelineAbortedError'
    this.runId = runId
  }
}

/** Throw if the admin requested abort (checked between posts / stages). */
export async function assertNotAborted(runId: string | undefined): Promise<void> {
  if (!runId) return
  if (await isAbortRequested(runId)) throw new PipelineAbortedError(runId)
}

export async function touchWorkerHeartbeat(): Promise<void> {
  if (!isSupabaseStoreConfigured()) return
  const sb = getSupabaseStore()
  await sb
    .from('pipeline_config')
    .upsert({
      id: 'default',
      worker_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
}

export async function readLastSuccessfulScrapeAt(): Promise<string | null> {
  if (!isSupabaseStoreConfigured()) return null
  const sb = getSupabaseStore()
  const { data } = await sb
    .from('pipeline_runs')
    .select('started_at')
    .in('mode', ['scrape', 'full'])
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.started_at ?? null
}

function normalizeIgHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim().split(/[/?#]/)[0]
}

/** Persist archived IG profile pics so /venues can show them even when Sheets write fails. */
export async function upsertVenueProfileImages(
  updates: Array<{ handle: string; primaryImageUrl: string }>,
  dryRun = false
): Promise<number> {
  if (updates.length === 0) return 0
  if (dryRun || !isSupabaseStoreConfigured()) return updates.length

  const sb = getSupabaseStore()
  const now = new Date().toISOString()
  const payload = updates
    .map((u) => ({
      instagram_handle: normalizeIgHandle(u.handle),
      primary_image_url: u.primaryImageUrl.trim(),
      updated_at: now,
    }))
    .filter((u) => u.instagram_handle && u.primary_image_url)

  if (payload.length === 0) return 0

  // Always write public _index.json (works without migration 021)
  await writeVenueProfileImagesIndex(payload.map((p) => ({
    handle: p.instagram_handle,
    primaryImageUrl: p.primary_image_url,
  })))

  const { data, error } = await sb
    .from('venue_profile_images')
    .upsert(payload, { onConflict: 'instagram_handle' })
    .select('instagram_handle')

  if (error) {
    if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      // Index JSON is enough until migration 021 is applied
      return payload.length
    }
    throw new Error(`venue_profile_images upsert failed: ${error.message}`)
  }
  return data?.length ?? 0
}

/** Merge handle→URL into public venue-images/_index.json for the Next.js app. */
export async function writeVenueProfileImagesIndex(
  updates: Array<{ handle: string; primaryImageUrl: string }>
): Promise<void> {
  if (!isSupabaseStoreConfigured() || updates.length === 0) return
  const sb = getSupabaseStore()

  let existing: Record<string, string> = {}
  const { data: blob } = await sb.storage.from('venue-images').download('_index.json')
  if (blob) {
    try {
      existing = JSON.parse(await blob.text()) as Record<string, string>
    } catch {
      existing = {}
    }
  }

  for (const u of updates) {
    const h = normalizeIgHandle(u.handle)
    const url = u.primaryImageUrl.trim()
    if (h && url) existing[h] = url
  }

  const body = Buffer.from(JSON.stringify(existing, null, 2), 'utf8')
  // Bucket may still be image-only until migration 021; widen mime types first.
  await sb.storage.updateBucket('venue-images', {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/json'],
    fileSizeLimit: 5242880,
  })
  const { error } = await sb.storage.from('venue-images').upload('_index.json', body, {
    contentType: 'application/json',
    upsert: true,
  })
  if (error) throw new Error(`venue-images _index.json upload failed: ${error.message}`)
}

export type StoredProfileImageKind = 'venue' | 'promoter' | 'profile'

export interface StoredProfileImage {
  handle: string
  kind: StoredProfileImageKind
  primaryImageUrl: string
  fileName: string
}

/**
 * List archived profile pics already in the venue-images bucket.
 * Filenames: venue_{handle}.jpg | promoter_{handle}.jpg | profile_{handle}.jpg
 */
export async function listStoredProfileImages(): Promise<StoredProfileImage[]> {
  if (!isSupabaseStoreConfigured()) return []
  const sb = getSupabaseStore()
  const { data: files, error } = await sb.storage.from('venue-images').list('', { limit: 1000 })
  if (error) throw new Error(`venue-images list failed: ${error.message}`)
  if (!files?.length) return []

  const cfg = getConfig()
  const base = (cfg.SUPABASE_URL || '').replace(/\/$/, '')
  const out: StoredProfileImage[] = []

  for (const f of files) {
    const name = f.name || ''
    if (name === '_index.json') continue
    const m = name.match(/^(venue|promoter|profile)_(.+)\.(jpe?g|png|gif|webp)$/i)
    if (!m) continue
    const kind = m[1].toLowerCase() as StoredProfileImageKind
    const handle = normalizeIgHandle(m[2])
    if (!handle) continue
    out.push({
      handle,
      kind,
      fileName: name,
      primaryImageUrl: `${base}/storage/v1/object/public/venue-images/${name}`,
    })
  }

  return out
}

/**
 * Seed venue image URLs from files already in the venue-images bucket
 * (e.g. archived before Sheets failed). Paths look like venue_{handle}.jpg.
 */
export async function backfillVenueProfileImagesFromStorage(): Promise<number> {
  const stored = await listStoredProfileImages()
  if (stored.length === 0) return 0
  return upsertVenueProfileImages(
    stored.map((s) => ({ handle: s.handle, primaryImageUrl: s.primaryImageUrl })),
    false
  )
}
