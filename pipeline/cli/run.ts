/**
 * Pipeline CLI.
 *
 *   npm run profile-images  [-- --handle=lux --force-venue-images --sheets-only]
 *   npm run scrape          [-- --handle=lux --dry-run --limit=10]
 *   npm run extract         [-- --limit=20 --dry-run --force-vision]
 *   npm run verify          [-- --limit=20 --dry-run]
 *   npm run full            [-- ...]   # posts scrape → extract (no profile images)
 *   npm run publish         [-- --dry-run]  # Processed Events → Events Clean New
 *
 * Storage split:
 *   - Watchlist + Processed Events → Google Sheets (high-confidence auto-appended)
 *   - Events Clean New → site calendar CSV (publish step copies novel Processed rows)
 *   - Raw posts, extractions, review queue, verifications, runs → Supabase
 *   - extract/full always run Tier 5 unless --skip-verify
 *   - --dry-run skips remote writes (local CSV for Processed only)
 */

import { getConfig } from '../config'
import { fetchApifyRunItems, scrapeInstagram } from '../scrapers/apify-client'
import { transformInstagramApifyPost } from '../scrapers/instagram-transform'
import { archiveImage } from '../media/media-archive'
import { syncProfileImages } from '../media/venue-profile-images'
import { processPost } from '../process-post'
import { dedupeCandidates } from '../qualification/dedupe'
import {
  needsHumanReview,
  toVerificationLogRow,
  verifyProcessedEvent,
  isVerifyQuotaError,
} from '../intelligence/event-verification'
import type { EventsRawRow, NeedsReviewRow, ProcessedEventRow } from '../types'
import {
  appendProcessed,
  appendRunLog,
  publishProcessedToEventsClean,
  readLastSuccessfulRunAt,
  readProcessedEvents,
  readProcessedFingerprints,
  readWatchlist,
} from '../sinks/sheets-writer'
import { isSheetsWriteEnabled } from '../sinks/sheets-client'
import {
  appendReviewQueue,
  appendRunLogLine,
  appendVerifications,
  assertNotAborted,
  createPipelineRun,
  isAbortRequested,
  isSupabaseStoreConfigured,
  PipelineAbortedError,
  type PipelineRunMode,
  readExistingPipelineSourceIds,
  readLastSuccessfulScrapeAt,
  readPendingPipelinePosts,
  readVerifiedEventIdsFromStore,
  requeuePipelinePosts,
  requeuePipelinePostsBySourceEventIds,
  updatePipelineRun,
  upsertPipelinePosts,
  type ProcessingStatus,
} from '../sinks/supabase-store'

export interface CliFlags {
  command: string
  handle?: string
  /** Max posts/events **per Instagram handle** (not a global run total). */
  limit?: number
  dryRun: boolean
  forceVision: boolean
  skipVerify: boolean
  /** @deprecated scrape/full are posts-only; use mode profile-images */
  syncVenueImages: boolean
  forceVenueImages: boolean
  /** Skip Apify; only push Supabase venue-images → Venues/Promoters sheets */
  sheetsOnly: boolean
  /**
   * Only fetch posts newer than now − N days.
   * Combined with last successful scrape: Apify cutoff = max(lastScrape, now − N days).
   */
  postMaxAgeDays?: number
  /** Reset matching posts to status=new before extract (or as standalone requeue). */
  requeue: boolean
  /** Statuses to requeue (comma list). Default processed,needs_review,discarded */
  requeueStatuses?: ProcessingStatus[]
  /** Only requeue posts with posted_at within N days */
  requeuePostedSinceDays?: number
  /** Only requeue posts with scraped_at within N days */
  requeueScrapedSinceDays?: number
  /**
   * After scrape (or --from-apify-run): upsert ALL Apify posts in the batch as status=new
   * (including already_known) so extract runs filter/AI on the full batch.
   */
  analyzeApifyBatch: boolean
  /** Reload items from an existing Apify run id instead of starting a new scrape */
  fromApifyRun?: string
  /** When set by the worker, status/logs go to this pipeline_runs row */
  runId?: string
}

export function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    command: argv[0] ?? 'full',
    dryRun: false,
    forceVision: false,
    skipVerify: false,
    syncVenueImages: false,
    forceVenueImages: false,
    sheetsOnly: false,
    requeue: false,
    analyzeApifyBatch: false,
  }
  for (const arg of argv.slice(1)) {
    if (arg === '--dry-run') flags.dryRun = true
    else if (arg === '--force-vision') flags.forceVision = true
    else if (arg === '--skip-verify') flags.skipVerify = true
    else if (arg === '--skip-venue-images') flags.syncVenueImages = false
    else if (arg === '--sync-venue-images') flags.syncVenueImages = true
    else if (arg === '--force-venue-images') flags.forceVenueImages = true
    else if (arg === '--sheets-only') flags.sheetsOnly = true
    else if (arg === '--requeue') flags.requeue = true
    else if (arg === '--analyze-apify-batch') flags.analyzeApifyBatch = true
    else if (arg.startsWith('--from-apify-run=')) {
      flags.fromApifyRun = arg.slice('--from-apify-run='.length).trim()
      flags.analyzeApifyBatch = true // reloading a batch implies analyze
    }
    else if (arg.startsWith('--handle=')) flags.handle = arg.slice('--handle='.length).replace(/^@/, '').toLowerCase()
    else if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.slice('--limit='.length), 10) || undefined
    else if (arg.startsWith('--max-age-days=')) {
      const n = parseInt(arg.slice('--max-age-days='.length), 10)
      if (Number.isFinite(n) && n > 0) flags.postMaxAgeDays = Math.min(n, 365)
    } else if (arg.startsWith('--requeue-statuses=')) {
      const raw = arg.slice('--requeue-statuses='.length)
      const allowed = new Set<ProcessingStatus>(['new', 'discarded', 'needs_review', 'processed'])
      flags.requeueStatuses = raw
        .split(',')
        .map((s) => s.trim() as ProcessingStatus)
        .filter((s) => allowed.has(s))
    } else if (arg.startsWith('--requeue-posted-since-days=')) {
      const n = parseInt(arg.slice('--requeue-posted-since-days='.length), 10)
      if (Number.isFinite(n) && n > 0) flags.requeuePostedSinceDays = Math.min(n, 365)
    } else if (arg.startsWith('--requeue-scraped-since-days=')) {
      const n = parseInt(arg.slice('--requeue-scraped-since-days='.length), 10)
      if (Number.isFinite(n) && n > 0) flags.requeueScrapedSinceDays = Math.min(n, 365)
    } else if (arg.startsWith('--run-id=')) flags.runId = arg.slice('--run-id='.length)
  }
  return flags
}

/** Cap rows to N per Instagram handle (not a global total). Keeps newest first when ordered. */
function limitPerHandle<T>(
  rows: T[],
  limit: number | undefined,
  handleOf: (row: T) => string
): T[] {
  if (!limit || limit <= 0 || rows.length === 0) return rows
  const counts = new Map<string, number>()
  const out: T[] = []
  for (const row of rows) {
    const h = (handleOf(row) || '').replace(/^@/, '').toLowerCase() || '_unknown'
    const n = counts.get(h) ?? 0
    if (n >= limit) continue
    counts.set(h, n + 1)
    out.push(row)
  }
  return out
}

/** Resolve Apify onlyPostsNewerThan.
 * - With maxAgeDays: look back N days (overrides incremental last-scrape — this is what admins expect).
 * - Without: incremental from last successful scrape only.
 */
export async function resolveOnlyPostsNewerThan(
  postMaxAgeDays?: number
): Promise<{
  cutoff?: string
  lastScrapeAt?: string
  maxAgeCutoff?: string
  cutoffSource?: 'max_age_days' | 'last_scrape' | 'none'
}> {
  const lastScrapeAt =
    (await readLastSuccessfulScrapeAt()) ?? (await readLastSuccessfulRunAt()) ?? undefined

  let maxAgeCutoff: string | undefined
  if (postMaxAgeDays != null && postMaxAgeDays > 0) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - postMaxAgeDays)
    maxAgeCutoff = d.toISOString()
  }

  // Explicit lookback wins — otherwise max(lastScrape, maxAge) made maxAgeDays useless
  // whenever a recent scrape existed (e.g. 30 days requested but cutoff = 4 minutes ago).
  if (maxAgeCutoff) {
    return {
      cutoff: maxAgeCutoff,
      lastScrapeAt,
      maxAgeCutoff,
      cutoffSource: 'max_age_days',
    }
  }
  if (lastScrapeAt) {
    const ms = Date.parse(lastScrapeAt)
    const cutoff = Number.isFinite(ms) ? new Date(ms).toISOString() : lastScrapeAt
    return { cutoff, lastScrapeAt, cutoffSource: 'last_scrape' }
  }
  return { cutoffSource: 'none' }
}

async function logRun(flags: CliFlags, line: string): Promise<void> {
  console.log(line)
  if (flags.runId && isSupabaseStoreConfigured()) {
    await appendRunLogLine(flags.runId, line)
  }
}

export async function commandProfileImages(flags: CliFlags): Promise<Record<string, unknown>> {
  let watchlist = await readWatchlist()
  if (flags.handle) watchlist = watchlist.filter((w) => w.handle === flags.handle)
  if (watchlist.filter((w) => w.active).length === 0) {
    await logRun(flags, '[profile-images] No active handles in Fontes IG (or --handle not found).')
    return { profiles_fetched: 0, archived: 0 }
  }

  await logRun(flags, '=== STAGE: profile-images (start) ===')
  const imgStats = await syncProfileImages(watchlist, {
    dryRun: flags.dryRun,
    force: flags.forceVenueImages,
    sheetsOnly: flags.sheetsOnly,
    log: (line) => logRun(flags, line),
  })
  await logRun(flags, '=== STAGE: profile-images (done) ===')
  return { profile_images: imgStats }
}

export async function commandScrape(flags: CliFlags): Promise<Record<string, unknown>> {
  const runId = `run_${Date.now()}`
  const startedAt = new Date().toISOString()
  const cfg = getConfig()
  const stats: Record<string, unknown> = { posts_scraped: 0, new_rows: 0 }

  let watchlist = await readWatchlist()
  if (flags.handle) watchlist = watchlist.filter((w) => w.handle === flags.handle)
  const handles = watchlist.filter((w) => w.active).map((w) => w.handle)
  if (handles.length === 0 && !flags.fromApifyRun) {
    await logRun(flags, 'No active handles in Watchlist tab (or --handle not found). Nothing to scrape.')
    return stats
  }

  // Legacy: only if explicitly --sync-venue-images (prefer mode profile-images)
  if (flags.syncVenueImages) {
    await logRun(flags, '=== STAGE: profile-images (start) ===')
    try {
      const imgStats = await syncProfileImages(watchlist, {
        dryRun: flags.dryRun,
        force: flags.forceVenueImages,
        log: (line) => logRun(flags, line),
      })
      stats.profile_images = imgStats
      await logRun(flags, '=== STAGE: profile-images (done) ===')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await logRun(flags, `[profile-images] unexpected error (continuing scrape): ${msg}`)
      await logRun(flags, '=== STAGE: profile-images (error, continuing) ===')
      stats.profile_images_error = msg
    }
  }

  const window = await resolveOnlyPostsNewerThan(flags.postMaxAgeDays)
  const onlyPostsNewerThan = window.cutoff
  const cutoffExplain =
    window.cutoffSource === 'max_age_days'
      ? `lookback=${flags.postMaxAgeDays}d → ${window.maxAgeCutoff}` +
        (window.lastScrapeAt ? ` (lastScrape=${window.lastScrapeAt} ignored — lookback widens window)` : '')
      : window.cutoffSource === 'last_scrape'
        ? `incremental lastScrape=${window.lastScrapeAt}`
        : 'no date cutoff (full history up to resultsLimit)'
  await logRun(
    flags,
    `[scrape] ${handles.length} handle(s), mode=${cfg.PIPELINE_RUN_MODE}, newerThan=${onlyPostsNewerThan ?? 'none'} — ${cutoffExplain}`
  )

  let apifyRunIds: string[] = []
  let items: ReturnType<typeof transformInstagramApifyPost>[] = []
  let error = ''
  let apifyRawCount = 0
  let droppedByDate = 0

  try {
    if (flags.fromApifyRun) {
      await logRun(
        flags,
        `[scrape] reloading Apify run ${flags.fromApifyRun} (analyze batch — no new actor call)`
      )
      const reloaded = await fetchApifyRunItems(flags.fromApifyRun)
      apifyRunIds = [reloaded.apifyRunId]
      apifyRawCount = reloaded.items.length
      await logRun(flags, `[scrape] Apify dataset returned ${reloaded.items.length} item(s)`)
      items = reloaded.items.map((item) => transformInstagramApifyPost(item, runId))
    } else {
      const runs = await scrapeInstagram({
        handles,
        onlyPostsNewerThan,
        resultsLimitPerAccount: flags.limit,
      })
      apifyRunIds = runs.map((r) => r.apifyRunId)
      const rawItems = runs.flatMap((r) => r.items)
      apifyRawCount = rawItems.length
      await logRun(
        flags,
        `[scrape] Apify returned ${rawItems.length} item(s)` +
          (flags.limit ? ` (resultsLimit=${flags.limit}/handle)` : '')
      )
      items = rawItems.map((item) => transformInstagramApifyPost(item, runId))
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    await logRun(flags, `[scrape] failed: ${error}`)
  }

  // Safety net if Apify returns older posts than the cutoff
  if (onlyPostsNewerThan && !flags.fromApifyRun) {
    const before = items.length
    const cutMs = Date.parse(onlyPostsNewerThan)
    if (Number.isFinite(cutMs)) {
      items = items.filter((row) => {
        if (!row?.posted_at) return true
        const t = Date.parse(row.posted_at)
        return !Number.isFinite(t) || t >= cutMs
      })
      droppedByDate = before - items.length
      if (droppedByDate > 0) {
        await logRun(
          flags,
          `[scrape] dropped ${droppedByDate} post(s) older than ${onlyPostsNewerThan}`
        )
      }
    }
  }

  const existingIds = await readExistingPipelineSourceIds()
  const usable = items.filter((r): r is EventsRawRow => r !== null)
  let rows: EventsRawRow[]
  let alreadyKnown = 0

  if (flags.analyzeApifyBatch) {
    // Full Apify batch → status=new (including posts we already scraped before)
    alreadyKnown = usable.filter((r) => existingIds.has(r.source_event_id)).length
    rows = usable
    await logRun(
      flags,
      `[scrape] analyze-apify-batch ON — ${rows.length} post(s) (${alreadyKnown} already known → status reset; ${rows.length - alreadyKnown} new → insert)`
    )
  } else {
    rows = usable.filter((r) => !existingIds.has(r.source_event_id))
    alreadyKnown = usable.length - rows.length
  }
  const beforeLimit = rows.length
  rows = [...rows].sort((a, b) => {
    const tb = Date.parse(b.posted_at || '') || 0
    const ta = Date.parse(a.posted_at || '') || 0
    return tb - ta
  })
  rows = limitPerHandle(rows, flags.limit, (r) => r.owner_username)
  if (flags.limit && rows.length < beforeLimit) {
    await logRun(
      flags,
      `[scrape] limit=${flags.limit}/handle → kept ${rows.length}/${beforeLimit} post(s)`
    )
  }

  const knownRows = rows.filter((r) => existingIds.has(r.source_event_id))
  const newRows = rows.filter((r) => !existingIds.has(r.source_event_id))

  // Archive images only for new posts (re-archiving hundreds of known ones is slow)
  for (let i = 0; i < newRows.length; i++) {
    const row = newRows[i]
    if (!flags.dryRun && row.displayUrl && cfg.EVENT_IMPORT_API_KEY) {
      const archived = await archiveImage(row.displayUrl, `raw_${row.shortCode || row.id}`)
      if (archived) {
        row.stored_image_url = archived.url
        row.image_storage_path = archived.path
        row.image_status = 'stored'
      } else {
        row.image_status = 'error'
        row.image_error = 'persist_image_failed'
      }
    }
    if (newRows.length > 40 && (i + 1) % 40 === 0) {
      await logRun(flags, `[scrape] archived images ${i + 1}/${newRows.length}`)
    }
  }

  let written = 0
  if (knownRows.length > 0) {
    const n = await requeuePipelinePostsBySourceEventIds(
      knownRows.map((r) => r.source_event_id),
      flags.dryRun
    )
    written += n
    await logRun(flags, `[scrape] reset ${n} already-known post(s) to status=new`)
  }
  if (newRows.length > 0) {
    await logRun(flags, `[scrape] upserting ${newRows.length} new post(s) in chunks…`)
    const result = await upsertPipelinePosts(newRows, flags.dryRun)
    written += result.written
  }
  stats.posts_scraped = items.length
  stats.new_rows = written
  stats.already_known = alreadyKnown
  stats.analyze_apify_batch = flags.analyzeApifyBatch
  stats.apify_raw_items = apifyRawCount
  stats.dropped_by_date = droppedByDate
  stats.apify_run_id = apifyRunIds.join('|')
  stats.only_posts_newer_than = onlyPostsNewerThan ?? null
  stats.post_max_age_days = flags.postMaxAgeDays ?? null
  stats.cutoff_source = window.cutoffSource ?? null
  if (flags.fromApifyRun) stats.from_apify_run = flags.fromApifyRun

  await logRun(
    flags,
    `[scrape] SUMMARY: apify=${apifyRawCount} → after_date_filter=${usable.length} → upserted=${written} already_known=${alreadyKnown}` +
      (flags.analyzeApifyBatch ? ' (batch analyze: known posts reset to new)' : '')
  )
  if (written === 0) {
    const why =
      apifyRawCount === 0
        ? 'Apify returned 0 items (blocks, bad handles, or empty feeds).'
        : alreadyKnown > 0 && droppedByDate === 0 && !flags.analyzeApifyBatch
          ? 'All returned posts were already in pipeline_posts. Enable “Analyze Apify batch” (or --analyze-apify-batch) to re-run AI on them.'
          : alreadyKnown > 0 && !flags.analyzeApifyBatch
            ? 'Remaining posts after date filter were already known.'
            : 'No usable posts after filters.'
    await logRun(flags, `[scrape] WHY 0 new: ${why}`)
    await logRun(
      flags,
      `[scrape] TIP: set Max age (days) to look back further; or check Analyze Apify batch to process the full actor result.`
    )
  } else {
    await logRun(
      flags,
      `[scrape] wrote/updated ${written} pipeline_posts (status=new) — extract will pick these up`
    )
  }
  // Legacy Sheets Run_Log — optional; never abort the scrape if Sheets API is unavailable
  try {
    await appendRunLog(
      {
        run_id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        mode: cfg.PIPELINE_RUN_MODE,
        handles: handles.join('|'),
        posts_scraped: items.length,
        new_rows: written,
        apify_run_id: apifyRunIds.join('|'),
        status: error ? 'error' : 'success',
        error,
      },
      flags.dryRun
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logRun(flags, `[scrape] Run_Log sheet append skipped: ${msg}`)
  }

  if (flags.runId && apifyRunIds.length) {
    await updatePipelineRun(flags.runId, { apify_run_id: apifyRunIds.join('|') })
  }

  if (error) throw new Error(error)
  return stats
}

export async function commandRequeue(flags: CliFlags): Promise<Record<string, unknown>> {
  const postedSince =
    flags.requeuePostedSinceDays ??
    flags.postMaxAgeDays ??
    undefined
  await logRun(
    flags,
    `[requeue] handle=${flags.handle ?? '*'} statuses=${(flags.requeueStatuses ?? ['processed', 'needs_review', 'discarded']).join(',')}` +
      ` posted_since_days=${postedSince ?? 'any'} scraped_since_days=${flags.requeueScrapedSinceDays ?? 'any'} limit=${flags.limit != null ? `${flags.limit}/handle` : 'none'}`
  )
  const result = await requeuePipelinePosts({
    handle: flags.handle,
    statuses: flags.requeueStatuses,
    postedSinceDays: postedSince,
    scrapedSinceDays: flags.requeueScrapedSinceDays,
    limit: flags.limit,
    dryRun: flags.dryRun,
  })
  await logRun(
    flags,
    `[requeue] matched=${result.matched} requeued=${result.requeued}` +
      (flags.dryRun ? ' (dry-run)' : ' → status=new (extract will pick these up)')
  )
  return { requeue_matched: result.matched, requeued: result.requeued }
}

export async function commandExtract(flags: CliFlags): Promise<Record<string, unknown>> {
  const stats: Record<string, unknown> = {}
  if (flags.requeue || flags.command === 'requeue') {
    Object.assign(stats, await commandRequeue(flags))
    if (flags.command === 'requeue') return stats
  }

  const pending = await readPendingPipelinePosts({
    handle: flags.handle,
    // Fetch all candidates; apply per-handle limit below (DB limit would be global)
  })

  const pendingLimited = limitPerHandle(pending, flags.limit, (r) => r.owner_username)
  if (flags.limit && pendingLimited.length < pending.length) {
    await logRun(
      flags,
      `[extract] limit=${flags.limit}/handle → ${pendingLimited.length}/${pending.length} pending post(s)`
    )
  }

  if (pendingLimited.length === 0) {
    await logRun(
      flags,
      '[extract] SUMMARY: pending_new=0 → nothing to extract (no pipeline_posts with status=new).'
    )
    await logRun(
      flags,
      '[extract] WHY: scrape found 0 new posts, or earlier extract already processed them. Processed Events only gets auto-pass from NEW extracts — Review queue is separate.'
    )
    await logRun(
      flags,
      '[extract] TIP: npm run requeue -- --posted-since-days=14 (or Queue “Re-queue + Extract” in admin), then extract runs on status=new.'
    )
    return { ...stats, processed: 0, needs_review: 0, discarded: 0, pending_new: 0 }
  }

  await logRun(flags, `[extract] ${pendingLimited.length} pending post(s)`)

  const allProcessed: ProcessedEventRow[] = []
  const allNeedsReview: NeedsReviewRow[] = []
  let discarded = 0
  let aborted = false

  for (const row of pendingLimited) {
    if (flags.runId && (await isAbortRequested(flags.runId))) {
      aborted = true
      await logRun(
        flags,
        `[extract] abort requested — stopping (${allProcessed.length + allNeedsReview.length + discarded} post(s) already handled)`
      )
      break
    }
    try {
      const result = await processPost(row, {
        forceVision: flags.forceVision,
        skipArchive: flags.dryRun,
        postDbId: row._db_id,
        dryRun: flags.dryRun,
      })
      if (result.discarded) {
        discarded++
        await logRun(flags, `  - ${row.shortCode || row.id}: discarded (${result.discardReason})`)
        continue
      }
      await logRun(
        flags,
        `  - ${row.shortCode || row.id}: ${result.processed.length} pass / ${result.needsReview.length} review [${result.tiersRun.join(' → ')}] pattern=${result.post_pattern ?? '?'}`
      )
      allProcessed.push(...result.processed)
      allNeedsReview.push(...result.needsReview)
    } catch (err) {
      await logRun(
        flags,
        `  - ${row.shortCode || row.id}: pipeline error: ${err instanceof Error ? err.message : err}`
      )
    }
  }

  const existingFingerprints = flags.dryRun ? new Set<string>() : await readProcessedFingerprints()
  const { kept, droppedAsDuplicate, droppedAsExisting } = dedupeCandidates(
    allProcessed.map((row) => ({
      row,
      fingerprint: row.fingerprint,
      confidence_score: parseFloat(row.confidence_score) || 0,
      sources: row.sources.split('|').filter(Boolean),
    })),
    existingFingerprints
  )
  const keptRows = kept.map((k) => {
    k.row.sources = k.sources.join('|')
    k.row.source_count = String(k.sources.length)
    return k.row
  })

  // High-confidence auto-pass → Processed sheet (no human review). Soft fails → review queue.
  // If Sheets write is unavailable, park auto-pass in the review queue for manual paste.
  if (!isSheetsWriteEnabled()) {
    const manualQueue: NeedsReviewRow[] = keptRows.map((row) => ({
      review_id: `rev_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source_name: row.source_name,
      source_event_id: row.source_event_id,
      source_url: row.source_url,
      owner_username: row.source_name,
      caption: '',
      description_short: row.title || row.description_short,
      description_long: row.description_long,
      validation_status: 'pass',
      validation_reasons: 'manual_sheets_paste',
      confidence_score: row.confidence_score,
      start_datetime: row.start_datetime,
      venue_name_raw: row.venue_name_raw || row.venue_name,
      route: 'manual_sheets',
      _raw_caption_ai_text: '',
      raw_model_text: row._raw_model_text || '',
      created_at: new Date().toISOString(),
      thumbnail_url: '',
      stored_image_url: row.primary_image_url,
      image_storage_path: '',
      image_error: '',
      verification_verdict: '',
      verification_notes:
        'Auto-pass (Sheets write disabled). Set PIPELINE_SHEETS_WRITE=1 + service account, or paste into Processed Events.',
      verification_sources: '',
      suggested_corrections: JSON.stringify({
        title: row.title,
        start_datetime: row.start_datetime,
        venue_name: row.venue_name || row.venue_name_raw,
        primary_image_url: row.primary_image_url,
        event_id: row.event_id,
      }),
    }))
    await appendProcessed(keptRows, true) // local CSV only
    await appendReviewQueue([...allNeedsReview, ...manualQueue], flags.dryRun)
    await logRun(
      flags,
      `[extract] Sheets write OFF — ${keptRows.length} auto-pass event(s) queued for manual paste + ${allNeedsReview.length} needs-review`
    )
  } else {
    await appendProcessed(keptRows, flags.dryRun)
    await appendReviewQueue(allNeedsReview, flags.dryRun)
    await logRun(
      flags,
      `[extract] wrote ${keptRows.length} high-confidence event(s) to Processed; ${allNeedsReview.length} sent to review queue`
    )
  }

  await logRun(
    flags,
    `[extract] SUMMARY: processed→Processed=${keptRows.length} review_queue=${allNeedsReview.length} discarded=${discarded} dupes_in_batch=${droppedAsDuplicate} already_on_Processed=${droppedAsExisting}`
  )
  if (keptRows.length === 0 && allNeedsReview.length > 0) {
    await logRun(
      flags,
      `[extract] WHY 0 Processed: candidates failed soft checks (missing venue name, low confidence, program undersplit, …) → Review. Title+datetime+venue string auto-publish even if venue_id unmatched.`
    )
  } else if (keptRows.length === 0 && allNeedsReview.length === 0 && discarded > 0) {
    await logRun(flags, `[extract] WHY 0 Processed: all posts discarded (hard fail / no events).`)
  }
  await logRun(
    flags,
    `[extract] done: ${keptRows.length} processed, ${allNeedsReview.length} needs-review, ${discarded} discarded, ${droppedAsDuplicate} in-batch dupes, ${droppedAsExisting} already published`
  )
  if (flags.dryRun || !isSheetsWriteEnabled()) {
    await logRun(flags, '[extract] local CSV under pipeline/out/ (Processed Events sheet not auto-updated)')
  }

  if (aborted && flags.runId) {
    throw new PipelineAbortedError(flags.runId)
  }

  // Tier 5 online verify on this run's auto-pass rows (unless --skip-verify).
  // Unclean verifies → Tier 6 /admin/event-review; clean ones stay published without review.
  let verifyStats: Record<string, unknown> = {}
  if (flags.skipVerify) {
    await logRun(flags, '=== STAGE: verify (skipped: --skip-verify) ===')
  } else if (keptRows.length === 0) {
    await logRun(
      flags,
      '=== STAGE: verify (skipped: no high-confidence auto-pass events) ==='
    )
  } else {
    await assertNotAborted(flags.runId)
    await logRun(flags, '=== STAGE: verify (start) ===')
    verifyStats = await commandVerify({ ...flags, limit: undefined }, keptRows)
    await logRun(flags, '=== STAGE: verify (done) ===')
  }

  return {
    ...stats,
    processed: keptRows.length,
    needs_review: allNeedsReview.length,
    discarded,
    dropped_dupes: droppedAsDuplicate,
    dropped_existing: droppedAsExisting,
    aborted: aborted || undefined,
    ...verifyStats,
  }
}

export async function commandVerify(
  flags: CliFlags,
  onlyRows?: ProcessedEventRow[]
): Promise<Record<string, unknown>> {
  let events = onlyRows ?? (await readProcessedEvents())
  if (flags.handle) {
    events = events.filter((e) => (e.source_name || '').toLowerCase() === flags.handle)
  }

  const already = flags.dryRun && onlyRows ? new Set<string>() : await readVerifiedEventIdsFromStore()
  let pending = events.filter((e) => e.event_id && !already.has(e.event_id))
  const beforeVerifyLimit = pending.length
  pending = limitPerHandle(pending, flags.limit, (e) => e.source_name || '')
  if (flags.limit && pending.length < beforeVerifyLimit) {
    await logRun(
      flags,
      `[verify] limit=${flags.limit}/handle → ${pending.length}/${beforeVerifyLimit} event(s)`
    )
  }

  await logRun(flags, `[verify] ${pending.length} event(s) to verify (Tier 5 → Tier 6)`)
  if (pending.length === 0) return { verified: 0, queued_for_human: 0 }

  const logRows = []
  const humanQueue: NeedsReviewRow[] = []
  let verified = 0
  let queuedForHuman = 0
  let aborted = false

  for (const event of pending) {
    if (flags.runId && (await isAbortRequested(flags.runId))) {
      aborted = true
      await logRun(flags, `[verify] abort requested — stopping after ${logRows.length} event(s)`)
      break
    }
    try {
      const result = await verifyProcessedEvent(event)
      logRows.push(toVerificationLogRow(event, result))
      const correctionsJson = JSON.stringify(result.suggested_corrections ?? {})
      await logRun(
        flags,
        `  - ${event.event_id}: ${result.verdict} (${result.confidence}) — ${result.notes.slice(0, 80)}`
      )

      if (result.verdict === 'verified' && Object.keys(result.suggested_corrections ?? {}).length === 0) {
        verified++
      }

      if (needsHumanReview(result)) {
        queuedForHuman++
        const reason =
          result.verdict === 'disputed'
            ? 'online_verification_disputed'
            : result.verdict === 'not_found'
              ? 'online_verification_not_found'
              : Object.keys(result.suggested_corrections ?? {}).length > 0
                ? 'online_verification_suggested_corrections'
                : 'online_verification_inconclusive'

        humanQueue.push({
          review_id: `rev_verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          source_name: event.source_name,
          source_event_id: event.source_event_id || event.event_id,
          source_url: event.source_url,
          owner_username: event.source_name,
          caption: '',
          description_short: event.title,
          description_long: event.description_long || event.description_short,
          validation_status: 'review',
          validation_reasons: reason,
          confidence_score: event.confidence_score,
          start_datetime: event.start_datetime,
          venue_name_raw: event.venue_name_raw || event.venue_name,
          route: 'needs_review',
          _raw_caption_ai_text: '',
          raw_model_text: result.raw_model_text.slice(0, 40000),
          created_at: new Date().toISOString(),
          thumbnail_url: '',
          stored_image_url: event.primary_image_url,
          image_storage_path: '',
          image_error: '',
          verification_verdict: result.verdict,
          verification_notes: result.notes,
          verification_sources: result.sources,
          suggested_corrections: correctionsJson === '{}' ? '' : correctionsJson,
        })
      }
    } catch (err) {
      await logRun(
        flags,
        `  - ${event.event_id}: verify error: ${err instanceof Error ? err.message : err}`
      )
      if (isVerifyQuotaError(err)) {
        aborted = true
        await logRun(
          flags,
          `[verify] OpenAI quota/billing exhausted — aborting remaining ${Math.max(0, pending.length - logRows.length)} event(s). Top up billing or use --skip-verify / Brave search.`
        )
        break
      }
    }
  }

  await appendVerifications(logRows, flags.dryRun)
  if (humanQueue.length > 0) {
    await appendReviewQueue(humanQueue, flags.dryRun)
  }

  await logRun(
    flags,
    `[verify] done: clean_verified=${verified} queued_for_human=${queuedForHuman} logged=${logRows.length}` +
      (aborted ? ' (aborted early)' : '')
  )
  // Only throw PipelineAbortedError for explicit user abort, not quota stop
  if (aborted && flags.runId && (await isAbortRequested(flags.runId))) {
    throw new PipelineAbortedError(flags.runId)
  }
  return {
    verified,
    queued_for_human: queuedForHuman,
    logged: logRows.length,
    aborted: aborted || undefined,
  }
}

/** Processed Events (staging) → Events Clean New (live calendar CSV). */
export async function commandPublish(flags: CliFlags): Promise<Record<string, unknown>> {
  await logRun(flags, '=== STAGE: publish (start) ===')
  if (!isSheetsWriteEnabled() && !flags.dryRun) {
    await logRun(
      flags,
      '[publish] Sheets write disabled — set PIPELINE_SHEETS_WRITE=1 + service account, or use --dry-run for a local CSV preview'
    )
  }
  const result = await publishProcessedToEventsClean({ dryRun: flags.dryRun || !isSheetsWriteEnabled() })
  await logRun(
    flags,
    `[publish] processed=${result.processed} already_on_clean=${result.alreadyPublished} appended=${result.published} skipped_empty=${result.skippedEmpty} skipped_unsafe=${result.skippedUnsafe} skipped_unverified=${result.skippedUnverified}` +
      (result.skippedUnsafe
        ? ` unsafe_reasons=${JSON.stringify(result.unsafeReasons ?? {})}`
        : '') +
      (flags.dryRun || !isSheetsWriteEnabled() ? ' (dry-run / local CSV only)' : '')
  )
  await logRun(flags, '=== STAGE: publish (done) ===')
  return { ...result }
}

export async function runCommand(flags: CliFlags): Promise<Record<string, unknown>> {
  getConfig()
  const combined: Record<string, unknown> = {}

  // Record a run row for manual CLI invocations only (worker already owns its row)
  let createdRunId: string | undefined
  const skipRunLedger = flags.command === 'publish'
  if (!flags.runId && !flags.dryRun && !skipRunLedger && isSupabaseStoreConfigured()) {
    const modeForDb =
      flags.command === 'images'
        ? 'profile-images'
        : flags.command === 'requeue'
          ? 'extract'
          : (flags.command as PipelineRunMode)
    try {
      createdRunId =
        (await createPipelineRun({
          mode: modeForDb,
          runParams: {
            handle: flags.handle,
            limit: flags.limit,
            forceVision: flags.forceVision,
            sheetsOnly: flags.sheetsOnly,
            requeue: flags.requeue || flags.command === 'requeue',
            requeueStatuses: flags.requeueStatuses,
            requeuePostedSinceDays: flags.requeuePostedSinceDays,
            requeueScrapedSinceDays: flags.requeueScrapedSinceDays,
            analyzeApifyBatch: flags.analyzeApifyBatch,
            fromApifyRun: flags.fromApifyRun,
            pipelineCommand: flags.command === 'requeue' ? 'requeue' : undefined,
          },
          requestedBy: 'cli',
          status: 'running',
        })) ?? undefined
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Migration 022 not applied yet — still run the command without a runs row
      if (/pipeline_runs_mode_check|invalid input value/i.test(msg) && modeForDb === 'profile-images') {
        console.warn(`[cli] pipeline_runs cannot store mode=profile-images yet (${msg}). Continuing without a run row. Apply supabase/APPLY_021_022_profile_images.sql`)
      } else {
        throw err
      }
    }
    if (createdRunId) {
      flags = { ...flags, runId: createdRunId }
      await updatePipelineRun(createdRunId, {
        status: 'running',
        started_at: new Date().toISOString(),
      })
    }
  }

  try {
    switch (flags.command) {
      case 'profile-images':
      case 'images':
        Object.assign(combined, await commandProfileImages(flags))
        break
      case 'scrape':
        await logRun(flags, '=== STAGE: scrape (start) ===')
        Object.assign(combined, await commandScrape(flags))
        await logRun(flags, '=== STAGE: scrape (done) ===')
        break
      case 'extract':
        await logRun(flags, '=== STAGE: extract (start) ===')
        Object.assign(combined, await commandExtract(flags))
        await logRun(flags, '=== STAGE: extract (done) ===')
        break
      case 'requeue':
        await logRun(flags, '=== STAGE: requeue (start) ===')
        Object.assign(combined, await commandRequeue(flags))
        await logRun(flags, '=== STAGE: requeue (done) ===')
        break
      case 'verify':
        await logRun(flags, '=== STAGE: verify (start) ===')
        Object.assign(combined, await commandVerify(flags))
        await logRun(flags, '=== STAGE: verify (done) ===')
        break
      case 'full':
        // posts scrape → extract (tiers 0–4 + Tier 5). Profile images are a separate mode.
        await logRun(flags, '=== STAGE: scrape (start) ===')
        Object.assign(combined, await commandScrape(flags))
        await logRun(flags, '=== STAGE: scrape (done) ===')
        await assertNotAborted(flags.runId)
        await logRun(flags, '=== STAGE: extract (start) ===')
        Object.assign(combined, await commandExtract(flags))
        await logRun(flags, '=== STAGE: extract (done) ===')
        break
      case 'publish':
        Object.assign(combined, await commandPublish(flags))
        break
      default:
        throw new Error(
          `Unknown command "${flags.command}". Use: profile-images | scrape | extract | requeue | verify | full | publish`
        )
    }

    if (createdRunId) {
      await updatePipelineRun(createdRunId, {
        status: 'success',
        stats: combined,
        finished_at: new Date().toISOString(),
      })
    }
    return combined
  } catch (err) {
    if (err instanceof PipelineAbortedError) {
      await logRun(flags, `=== ABORTED === ${err.message}`)
      if (createdRunId) {
        await updatePipelineRun(createdRunId, {
          status: 'aborted',
          stats: combined,
          finished_at: new Date().toISOString(),
        })
      }
      throw err
    }
    if (createdRunId) {
      await updatePipelineRun(createdRunId, {
        status: 'error',
        stats: combined,
        finished_at: new Date().toISOString(),
      })
      await logRun(flags, `FAILED: ${err instanceof Error ? err.message : err}`)
    }
    throw err
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  await runCommand(flags)
}

main().catch((err) => {
  console.error('Pipeline failed:', err)
  process.exitCode = 1
})
