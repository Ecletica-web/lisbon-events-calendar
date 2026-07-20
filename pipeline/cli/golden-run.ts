/**
 * Golden-set replay — re-runs the intelligence tiers over the historic
 * "Testing - Needs_Review.csv" rows (joined with "Testing - Events_Raw.csv")
 * and measures how many datetime failures the new pipeline recovers.
 *
 *   npm run golden [-- --limit=20 --all --force-vision]
 *
 * --all       replay every Needs_Review row (default: only datetime failures)
 * Always dry-run: writes pipeline/out/golden-report.csv, never touches Sheets.
 */

import * as fs from 'fs'
import * as path from 'path'
import Papa from 'papaparse'
import { getConfig } from '../config'
import { processPost } from '../process-post'
import { extractCarouselSlideUrls } from '../scrapers/instagram-transform'
import type { ApifyInstagramItem } from '../scrapers/apify-client'
import type { EventsRawRow, MediaType } from '../types'

const ROOT = path.join(__dirname, '..', '..')
const NEEDS_REVIEW_CSV = path.join(ROOT, 'Testing - Needs_Review.csv')
const EVENTS_RAW_CSV = path.join(ROOT, 'Testing - Events_Raw.csv')
const OUT_DIR = path.join(__dirname, '..', 'out')

interface GoldenReportRow {
  source_event_id: string
  owner_username: string
  previous_reasons: string
  media_type: string
  tiers_run: string
  post_pattern: string
  outcome: 'recovered' | 'needs_review' | 'discarded' | 'no_events' | 'error'
  events_extracted: string
  recovered_datetimes: string
  on_slide_text_evidence: string
  notes: string
}

function parseCsvFile(file: string): Record<string, string>[] {
  const text = fs.readFileSync(file, 'utf8')
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data ?? []
}

function detectMediaTypeFromRaw(rawRow: Record<string, string> | undefined): MediaType {
  const type = (rawRow?.media_type ?? rawRow?.type ?? '').toLowerCase()
  if (type.includes('sidecar') || type === 'carousel') return 'carousel'
  if (type.includes('video')) return 'video'
  if (type.includes('image')) return 'image'
  return 'unknown'
}

/** Build a pipeline EventsRawRow from a historic Needs_Review row + optional Events_Raw row. */
function buildRawRow(
  nr: Record<string, string>,
  rawRow: Record<string, string> | undefined
): EventsRawRow {
  let slideUrls: string[] = []
  let videoUrl = ''
  let apifyItem: ApifyInstagramItem | null = null
  if (rawRow?.raw_json) {
    try {
      apifyItem = JSON.parse(rawRow.raw_json) as ApifyInstagramItem
      slideUrls = extractCarouselSlideUrls(apifyItem)
      videoUrl = apifyItem.videoUrl ?? ''
    } catch {
      // raw_json can be truncated in sheet exports; degrade to single image
    }
  }

  const mediaType = apifyItem && (apifyItem.childPosts?.length ?? 0) > 0
    ? 'carousel'
    : detectMediaTypeFromRaw(rawRow)

  const get = (key: string) => (rawRow?.[key] ?? nr[key] ?? '').trim()

  return {
    id: get('source_event_id') || get('id'),
    source_name: 'instagram',
    source_event_id: get('source_event_id') || get('id'),
    source_url: get('source_url'),
    owner_username: get('owner_username'),
    owner_id: get('owner_id'),
    owner_full_name: get('owner_full_name'),
    caption: nr.caption ?? rawRow?.caption ?? '',
    posted_at: get('posted_at') || get('timestamp') || nr.created_at || '',
    scraped_at: get('scraped_at'),
    run_id: 'golden',
    location_id: get('location_id'),
    location_name: get('location_name') || get('locationName'),
    location_address: get('location_address'),
    latitude: get('latitude'),
    longitude: get('longitude'),
    media_type: mediaType,
    media_urls: get('media_urls'),
    thumbnail_url: get('thumbnail_url'),
    permalink: get('permalink') || get('source_url'),
    hashtags: get('hashtags'),
    mentions: get('mentions'),
    external_links: get('external_links'),
    like_count: get('like_count'),
    comment_count: get('comment_count'),
    stored_image_url: get('stored_image_url'),
    image_status: get('image_status'),
    image_storage_path: get('image_storage_path'),
    image_error: get('image_error'),
    shortCode: get('shortCode'),
    displayUrl: get('displayUrl'),
    carousel_slide_urls: slideUrls.join('|'),
    archived_slide_urls: '',
    video_url: videoUrl,
    raw_json: rawRow?.raw_json ?? '',
    created_at: nr.created_at ?? '',
    updated_at: '',
  }
}

async function main(): Promise<void> {
  getConfig()
  const argv = process.argv.slice(2)
  const replayAll = argv.includes('--all')
  const forceVision = argv.includes('--force-vision')
  const limitArg = argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : undefined

  const needsReviewRows = parseCsvFile(NEEDS_REVIEW_CSV)
  const eventsRawRows = fs.existsSync(EVENTS_RAW_CSV) ? parseCsvFile(EVENTS_RAW_CSV) : []
  const rawById = new Map(eventsRawRows.map((r) => [(r.id ?? '').trim(), r]))

  let targets = needsReviewRows
  if (!replayAll) {
    targets = targets.filter((r) => (r.validation_reasons ?? '').includes('start_datetime'))
  }
  if (limit) targets = targets.slice(0, limit)

  console.log(
    `[golden] replaying ${targets.length} row(s) (${replayAll ? 'all' : 'datetime failures only'}) of ${needsReviewRows.length} Needs_Review rows`
  )

  const report: GoldenReportRow[] = []
  let recovered = 0
  let discarded = 0

  for (const nr of targets) {
    const sourceEventId = (nr.source_event_id ?? '').trim()
    const rawRow = rawById.get(sourceEventId)
    const row = buildRawRow(nr, rawRow)
    // Historic data: validate "past event" against the original post date, not today
    const referenceNow = row.posted_at ? new Date(row.posted_at) : new Date(0)

    const base = {
      source_event_id: sourceEventId,
      owner_username: row.owner_username,
      previous_reasons: nr.validation_reasons ?? '',
      media_type: row.media_type,
    }

    try {
      const result = await processPost(row, { skipArchive: true, now: referenceNow, forceVision })
      const recoveredDatetimes = result.events
        .filter((e) => e.start_datetime && !isNaN(new Date(e.start_datetime).getTime()))
        .map((e) => e.start_datetime)
        .join('|')

      let outcome: GoldenReportRow['outcome']
      if (result.discarded) {
        outcome = 'discarded'
        discarded++
      } else if (result.events.length === 0) {
        outcome = 'no_events'
      } else if (recoveredDatetimes) {
        outcome = 'recovered'
        recovered++
      } else {
        outcome = 'needs_review'
      }

      report.push({
        ...base,
        tiers_run: result.tiersRun.join('|'),
        post_pattern: result.post_pattern ?? '',
        outcome,
        events_extracted: String(result.events.length),
        recovered_datetimes: recoveredDatetimes,
        on_slide_text_evidence: result.events.map((e) => e.on_slide_text_evidence ?? '').filter(Boolean).join(' || '),
        notes: result.discardReason ?? '',
      })
      console.log(`  - ${sourceEventId} (@${row.owner_username}): ${outcome} (${result.events.length} events)`)
    } catch (err) {
      report.push({
        ...base,
        tiers_run: '',
        post_pattern: '',
        outcome: 'error',
        events_extracted: '0',
        recovered_datetimes: '',
        on_slide_text_evidence: '',
        notes: err instanceof Error ? err.message.slice(0, 200) : String(err),
      })
      console.error(`  - ${sourceEventId}: error`, err instanceof Error ? err.message : err)
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const reportPath = path.join(OUT_DIR, 'golden-report.csv')
  fs.writeFileSync(reportPath, Papa.unparse(report), 'utf8')

  console.log('\n[golden] summary')
  console.log(`  replayed:   ${targets.length}`)
  console.log(`  recovered:  ${recovered} (valid start_datetime extracted)`)
  console.log(`  discarded:  ${discarded} (classified non-event/recap)`)
  console.log(`  other:      ${targets.length - recovered - discarded}`)
  console.log(`  report:     ${reportPath}`)
}

main().catch((err) => {
  console.error('Golden run failed:', err)
  process.exitCode = 1
})
