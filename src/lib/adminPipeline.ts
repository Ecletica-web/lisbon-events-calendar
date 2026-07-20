/**
 * Admin pipeline data access (Supabase service role).
 */

import { supabaseServer } from '@/lib/supabase/server'

function sb() {
  if (!supabaseServer) throw new Error('Supabase not configured')
  return supabaseServer
}

export async function getAdminHubCounts() {
  const client = sb()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [queued, pendingReview, postsWeek, config] = await Promise.all([
    client.from('pipeline_runs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    client
      .from('pipeline_review_queue')
      .select('id', { count: 'exact', head: true })
      .eq('review_status', 'pending'),
    client
      .from('pipeline_posts')
      .select('id', { count: 'exact', head: true })
      .gte('scraped_at', weekAgo),
    client.from('pipeline_config').select('worker_heartbeat_at').eq('id', 'default').maybeSingle(),
  ])

  return {
    queuedRuns: queued.count ?? 0,
    pendingReviews: pendingReview.count ?? 0,
    postsThisWeek: postsWeek.count ?? 0,
    workerHeartbeatAt: config.data?.worker_heartbeat_at ?? null,
  }
}

export async function listPipelineRuns(limit = 20) {
  const { data, error } = await sb()
    .from('pipeline_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function enqueuePipelineRun(params: {
  mode: 'scrape' | 'extract' | 'verify' | 'full'
  runParams?: Record<string, unknown>
  requestedBy?: string
}) {
  const { data, error } = await sb()
    .from('pipeline_runs')
    .insert({
      mode: params.mode,
      status: 'queued',
      params: params.runParams ?? {},
      requested_by: params.requestedBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function requestAbortRun(runId: string) {
  const { data: existing, error: re } = await sb()
    .from('pipeline_runs')
    .select('status')
    .eq('id', runId)
    .single()
  if (re) throw new Error(re.message)
  if (!existing) throw new Error('Run not found')
  if (existing.status === 'queued') {
    const { data, error } = await sb()
      .from('pipeline_runs')
      .update({ status: 'aborted', finished_at: new Date().toISOString() })
      .eq('id', runId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }
  if (existing.status === 'running') {
    const { data, error } = await sb()
      .from('pipeline_runs')
      .update({ status: 'abort_requested' })
      .eq('id', runId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }
  return existing
}

export async function getPipelineConfig() {
  const { data, error } = await sb()
    .from('pipeline_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function savePipelineConfig(configJson: unknown) {
  const { data, error } = await sb()
    .from('pipeline_config')
    .upsert({
      id: 'default',
      config_json: configJson,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function listPipelinePosts(opts: {
  q?: string
  handle?: string
  status?: string
  mediaType?: string
  limit?: number
  offset?: number
}) {
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0
  let query = sb()
    .from('pipeline_posts')
    .select('*', { count: 'exact' })
    .order('posted_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (opts.handle) query = query.ilike('owner_username', opts.handle)
  if (opts.status) query = query.eq('processing_status', opts.status)
  if (opts.mediaType) query = query.eq('media_type', opts.mediaType)
  if (opts.q) query = query.or(`caption.ilike.%${opts.q}%,short_code.ilike.%${opts.q}%`)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getPipelinePostDetail(id: string) {
  const client = sb()
  const { data: post, error } = await client.from('pipeline_posts').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  const { data: extractions, error: ee } = await client
    .from('pipeline_extractions')
    .select('*')
    .eq('post_id', id)
    .order('created_at', { ascending: true })
  if (ee) throw new Error(ee.message)
  return { post, extractions: extractions ?? [] }
}

export async function listReviewQueue(status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') {
  let query = sb()
    .from('pipeline_review_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status !== 'all') query = query.eq('review_status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function resolveReviewItem(params: {
  reviewId: string
  action: 'approved' | 'rejected'
  resolvedBy: string
  fieldEdits?: Record<string, string>
}) {
  const client = sb()
  const { data: row, error } = await client
    .from('pipeline_review_queue')
    .select('*')
    .eq('review_id', params.reviewId)
    .single()
  if (error) throw new Error(error.message)

  const updates: Record<string, unknown> = {
    review_status: params.action,
    resolved_at: new Date().toISOString(),
    resolved_by: params.resolvedBy,
  }
  if (params.fieldEdits) {
    if (params.fieldEdits.description_short != null)
      updates.description_short = params.fieldEdits.description_short
    if (params.fieldEdits.start_datetime != null)
      updates.start_datetime = params.fieldEdits.start_datetime
    if (params.fieldEdits.venue_name_raw != null)
      updates.venue_name_raw = params.fieldEdits.venue_name_raw
    if (params.fieldEdits.description_long != null)
      updates.description_long = params.fieldEdits.description_long
  }

  const { data: updated, error: ue } = await client
    .from('pipeline_review_queue')
    .update(updates)
    .eq('review_id', params.reviewId)
    .select('*')
    .single()
  if (ue) throw new Error(ue.message)

  return { previous: row, updated }
}

/** Build a Processed Events sheet row from a review queue item + edits. */
export function reviewToProcessedRow(
  review: Record<string, unknown>,
  edits?: Record<string, string>
): Record<string, string> {
  const now = new Date().toISOString()
  const title =
    edits?.description_short ||
    String(review.description_short || '') ||
    'Untitled event'
  const start = edits?.start_datetime || String(review.start_datetime || '')
  const venue = edits?.venue_name_raw || String(review.venue_name_raw || '')
  const eventId = `evt_review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    event_id: eventId,
    source_name: String(review.owner_username || review.source_name || ''),
    source_event_id: String(review.source_event_id || ''),
    sources: String(review.owner_username || review.source_name || ''),
    source_count: '1',
    source_url: String(review.source_url || ''),
    dedupe_key: '',
    fingerprint: `${title.toLowerCase()}|${start}|unknown`,
    title,
    description_short: title,
    description_long: edits?.description_long || String(review.description_long || ''),
    start_datetime: start,
    end_datetime: '',
    timezone: 'Europe/Lisbon',
    is_all_day: 'false',
    status: 'scheduled',
    venue_id: '',
    venue_name: venue,
    venue_name_raw: venue,
    venue_address: '',
    neighborhood: '',
    city: 'Lisboa',
    country: 'Portugal',
    latitude: '',
    longitude: '',
    category: '',
    tags: '',
    price_min: '',
    price_max: '',
    currency: '',
    is_free: '',
    age_restriction: '',
    language: '',
    ticket_url: '',
    primary_image_url: String(review.stored_image_url || review.thumbnail_url || ''),
    confidence_score: String(review.confidence_score || ''),
    first_seen_at: now,
    last_seen_at: now,
    changed_at: now,
    created_at: now,
    updated_at: now,
    _raw_model_text: String(review.raw_model_text || ''),
    post_pattern: '',
    extraction_source: 'merged',
    on_slide_text_evidence: '',
  }
}
