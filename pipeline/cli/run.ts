/**
 * Pipeline CLI.
 *
 *   npm run scrape  [-- --handle=lux --dry-run --limit=10]
 *   npm run extract [-- --limit=20 --dry-run --force-vision]
 *   npm run verify  [-- --limit=20 --dry-run]
 *   npm run full    [-- ...]
 *
 * Storage split:
 *   - Watchlist + Processed Events → Google Sheets (high-confidence auto-appended)
 *   - Raw posts, extractions, review queue, verifications, runs → Supabase
 *   - extract/full always run Tier 5 unless --skip-verify
 *   - --dry-run skips remote writes (local CSV for Processed only)
 */

import { getConfig } from '../config'
import { scrapeInstagram } from '../scrapers/apify-client'
import { transformInstagramApifyPost } from '../scrapers/instagram-transform'
import { archiveImage } from '../media/media-archive'
import { syncVenueProfileImages } from '../media/venue-profile-images'
import { processPost } from '../process-post'
import { dedupeCandidates } from '../qualification/dedupe'
import {
  needsHumanReview,
  toVerificationLogRow,
  verifyProcessedEvent,
} from '../intelligence/event-verification'
import type { EventsRawRow, NeedsReviewRow, ProcessedEventRow } from '../types'
import {
  appendProcessed,
  appendRunLog,
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
  createPipelineRun,
  isSupabaseStoreConfigured,
  readExistingPipelineSourceIds,
  readLastSuccessfulScrapeAt,
  readPendingPipelinePosts,
  readVerifiedEventIdsFromStore,
  updatePipelineRun,
  upsertPipelinePosts,
} from '../sinks/supabase-store'

export interface CliFlags {
  command: string
  handle?: string
  limit?: number
  dryRun: boolean
  forceVision: boolean
  skipVerify: boolean
  /** Fetch IG profile pics → venue-images → Venues.primary_image_url (default on for scrape/full) */
  syncVenueImages: boolean
  forceVenueImages: boolean
  /**
   * Only fetch posts newer than now − N days.
   * Combined with last successful scrape: Apify cutoff = max(lastScrape, now − N days).
   */
  postMaxAgeDays?: number
  /** When set by the worker, status/logs go to this pipeline_runs row */
  runId?: string
}

export function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    command: argv[0] ?? 'full',
    dryRun: false,
    forceVision: false,
    skipVerify: false,
    syncVenueImages: true,
    forceVenueImages: false,
  }
  for (const arg of argv.slice(1)) {
    if (arg === '--dry-run') flags.dryRun = true
    else if (arg === '--force-vision') flags.forceVision = true
    else if (arg === '--skip-verify') flags.skipVerify = true
    else if (arg === '--skip-venue-images') flags.syncVenueImages = false
    else if (arg === '--sync-venue-images') flags.syncVenueImages = true
    else if (arg === '--force-venue-images') flags.forceVenueImages = true
    else if (arg.startsWith('--handle=')) flags.handle = arg.slice('--handle='.length).replace(/^@/, '').toLowerCase()
    else if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.slice('--limit='.length), 10) || undefined
    else if (arg.startsWith('--max-age-days=')) {
      const n = parseInt(arg.slice('--max-age-days='.length), 10)
      if (Number.isFinite(n) && n > 0) flags.postMaxAgeDays = Math.min(n, 365)
    } else if (arg.startsWith('--run-id=')) flags.runId = arg.slice('--run-id='.length)
  }
  return flags
}

/** Resolve Apify onlyPostsNewerThan from last scrape + optional max-age window. */
export async function resolveOnlyPostsNewerThan(
  postMaxAgeDays?: number
): Promise<{ cutoff?: string; lastScrapeAt?: string; maxAgeCutoff?: string }> {
  const lastScrapeAt =
    (await readLastSuccessfulScrapeAt()) ?? (await readLastSuccessfulRunAt()) ?? undefined

  let maxAgeCutoff: string | undefined
  if (postMaxAgeDays != null && postMaxAgeDays > 0) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - postMaxAgeDays)
    maxAgeCutoff = d.toISOString()
  }

  const candidates = [lastScrapeAt, maxAgeCutoff].filter(Boolean) as string[]
  if (candidates.length === 0) return {}
  // Later timestamp = stricter (fewer older posts)
  const cutoff = candidates.sort().at(-1)
  return { cutoff, lastScrapeAt, maxAgeCutoff }
}

async function logRun(flags: CliFlags, line: string): Promise<void> {
  console.log(line)
  if (flags.runId && isSupabaseStoreConfigured()) {
    await appendRunLogLine(flags.runId, line)
  }
}

export async function commandScrape(flags: CliFlags): Promise<Record<string, unknown>> {
  const runId = `run_${Date.now()}`
  const startedAt = new Date().toISOString()
  const cfg = getConfig()
  const stats: Record<string, unknown> = { posts_scraped: 0, new_rows: 0 }

  let watchlist = await readWatchlist()
  if (flags.handle) watchlist = watchlist.filter((w) => w.handle === flags.handle)
  const handles = watchlist.filter((w) => w.active).map((w) => w.handle)
  if (handles.length === 0) {
    await logRun(flags, 'No active handles in Watchlist tab (or --handle not found). Nothing to scrape.')
    return stats
  }

  // Venue profile images (IG avatar → Supabase venue-images → Venues sheet)
  if (flags.syncVenueImages) {
    try {
      const imgStats = await syncVenueProfileImages(watchlist, {
        dryRun: flags.dryRun,
        force: flags.forceVenueImages,
        log: (line) => logRun(flags, line),
      })
      stats.venue_images = imgStats
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await logRun(flags, `[venue-images] unexpected error (continuing scrape): ${msg}`)
      stats.venue_images_error = msg
    }
  }

  const window = await resolveOnlyPostsNewerThan(flags.postMaxAgeDays)
  const onlyPostsNewerThan = window.cutoff
  await logRun(
    flags,
    `[scrape] ${handles.length} handle(s), mode=${cfg.PIPELINE_RUN_MODE}, newerThan=${onlyPostsNewerThan ?? 'none'}` +
      (window.lastScrapeAt ? ` (lastScrape=${window.lastScrapeAt})` : '') +
      (window.maxAgeCutoff
        ? ` (maxAgeDays=${flags.postMaxAgeDays} → ${window.maxAgeCutoff})`
        : '')
  )

  let apifyRunIds: string[] = []
  let items: ReturnType<typeof transformInstagramApifyPost>[] = []
  let error = ''

  try {
    const runs = await scrapeInstagram({ handles, onlyPostsNewerThan })
    apifyRunIds = runs.map((r) => r.apifyRunId)
    const rawItems = runs.flatMap((r) => r.items)
    await logRun(flags, `[scrape] Apify returned ${rawItems.length} item(s)`)
    items = rawItems.map((item) => transformInstagramApifyPost(item, runId))
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    await logRun(flags, `[scrape] failed: ${error}`)
  }

  // Safety net if Apify returns older posts than the cutoff
  if (onlyPostsNewerThan) {
    const before = items.length
    const cutMs = Date.parse(onlyPostsNewerThan)
    if (Number.isFinite(cutMs)) {
      items = items.filter((row) => {
        if (!row?.posted_at) return true
        const t = Date.parse(row.posted_at)
        return !Number.isFinite(t) || t >= cutMs
      })
      if (items.length < before) {
        await logRun(
          flags,
          `[scrape] dropped ${before - items.length} post(s) older than ${onlyPostsNewerThan}`
        )
      }
    }
  }

  const existingIds = await readExistingPipelineSourceIds()
  let rows = items.filter((r): r is EventsRawRow => r !== null && !existingIds.has(r.source_event_id))
  if (flags.limit) rows = rows.slice(0, flags.limit)

  for (const row of rows) {
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
  }

  const { written } = await upsertPipelinePosts(rows, flags.dryRun)
  stats.posts_scraped = items.length
  stats.new_rows = written
  stats.apify_run_id = apifyRunIds.join('|')
  stats.only_posts_newer_than = onlyPostsNewerThan ?? null
  stats.post_max_age_days = flags.postMaxAgeDays ?? null
  await logRun(flags, `[scrape] wrote ${written} new pipeline_posts (${items.length - rows.length} already known)`)

  // Legacy Sheets Run_Log (optional, when Sheets configured)
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

  if (flags.runId && apifyRunIds.length) {
    await updatePipelineRun(flags.runId, { apify_run_id: apifyRunIds.join('|') })
  }

  if (error) throw new Error(error)
  return stats
}

export async function commandExtract(flags: CliFlags): Promise<Record<string, unknown>> {
  const pending = await readPendingPipelinePosts({
    handle: flags.handle,
    limit: flags.limit,
  })

  if (pending.length === 0) {
    await logRun(flags, '[extract] no pending pipeline_posts with status=new — run scrape first.')
    return { processed: 0, needs_review: 0, discarded: 0 }
  }

  await logRun(flags, `[extract] ${pending.length} pending post(s)`)

  const allProcessed: ProcessedEventRow[] = []
  const allNeedsReview: NeedsReviewRow[] = []
  let discarded = 0

  for (const row of pending) {
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
    `[extract] done: ${keptRows.length} processed, ${allNeedsReview.length} needs-review, ${discarded} discarded, ${droppedAsDuplicate} in-batch dupes, ${droppedAsExisting} already published`
  )
  if (flags.dryRun || !isSheetsWriteEnabled()) {
    await logRun(flags, '[extract] local CSV under pipeline/out/ (Processed Events sheet not auto-updated)')
  }

  // Tier 5 online verify on this run's auto-pass rows (unless --skip-verify).
  // Unclean verifies → Tier 6 /admin/event-review; clean ones stay published without review.
  let verifyStats: Record<string, unknown> = {}
  if (!flags.skipVerify && keptRows.length > 0) {
    verifyStats = await commandVerify({ ...flags, limit: undefined }, keptRows)
  }

  return {
    processed: keptRows.length,
    needs_review: allNeedsReview.length,
    discarded,
    dropped_dupes: droppedAsDuplicate,
    dropped_existing: droppedAsExisting,
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
  if (flags.limit) pending = pending.slice(0, flags.limit)

  await logRun(flags, `[verify] ${pending.length} event(s) to verify (Tier 5 → Tier 6)`)
  if (pending.length === 0) return { verified: 0, queued_for_human: 0 }

  const logRows = []
  const humanQueue: NeedsReviewRow[] = []
  let verified = 0
  let queuedForHuman = 0

  for (const event of pending) {
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
    }
  }

  await appendVerifications(logRows, flags.dryRun)
  if (humanQueue.length > 0) {
    await appendReviewQueue(humanQueue, flags.dryRun)
  }

  await logRun(
    flags,
    `[verify] done: clean_verified=${verified} queued_for_human=${queuedForHuman} logged=${logRows.length}`
  )
  return { verified, queued_for_human: queuedForHuman, logged: logRows.length }
}

export async function runCommand(flags: CliFlags): Promise<Record<string, unknown>> {
  getConfig()
  const combined: Record<string, unknown> = {}

  // Record a run row for manual CLI invocations only (worker already owns its row)
  let createdRunId: string | undefined
  if (!flags.runId && !flags.dryRun && isSupabaseStoreConfigured()) {
    createdRunId =
      (await createPipelineRun({
        mode: flags.command as 'scrape' | 'extract' | 'verify' | 'full',
        runParams: {
          handle: flags.handle,
          limit: flags.limit,
          forceVision: flags.forceVision,
        },
        requestedBy: 'cli',
        status: 'running',
      })) ?? undefined
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
      case 'scrape':
        Object.assign(combined, await commandScrape(flags))
        break
      case 'extract':
        Object.assign(combined, await commandExtract(flags))
        break
      case 'verify':
        Object.assign(combined, await commandVerify(flags))
        break
      case 'full':
        // scrape → extract (tiers 0–4) → Tier 5 verify on auto-pass (inside extract)
        Object.assign(combined, await commandScrape(flags))
        Object.assign(combined, await commandExtract(flags))
        break
      default:
        throw new Error(`Unknown command "${flags.command}". Use: scrape | extract | verify | full`)
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
