/**
 * Tab-specific readers/writers for Google Sheets.
 * Watchlist + Processed Events stay here (human-editable).
 * Raw / review / verify / runs live in Supabase (see supabase-store.ts).
 * Legacy Run_Log append still supported for scrape history in Sheets.
 * In --dry-run mode rows are written to local CSVs under pipeline/out/.
 */

import * as fs from 'fs'
import * as path from 'path'
import Papa from 'papaparse'
import type {
  EventsRawRow,
  NeedsReviewRow,
  ProcessedEventRow,
  RunLogEntry,
  WatchlistEntry,
  VerificationLogRow,
} from '../types'
import { appendRows, readTab, isSheetsConfigured } from './sheets-client'

export const TAB_EVENTS_RAW = 'Events_Raw'
export const TAB_NEEDS_REVIEW = 'Needs_Review'
export const TAB_PROCESSED = 'Processed Events'
export const TAB_WATCHLIST = 'Watchlist'
export const TAB_RUN_LOG = 'Run_Log'
export const TAB_VERIFICATION = 'Verification_Log'

const EVENTS_RAW_HEADER: (keyof EventsRawRow)[] = [
  'id', 'source_name', 'source_event_id', 'source_url', 'owner_username', 'owner_id',
  'owner_full_name', 'caption', 'posted_at', 'scraped_at', 'run_id', 'location_id',
  'location_name', 'location_address', 'latitude', 'longitude', 'media_type', 'media_urls',
  'thumbnail_url', 'permalink', 'hashtags', 'mentions', 'external_links', 'like_count',
  'comment_count', 'stored_image_url', 'image_status', 'image_storage_path', 'image_error',
  'shortCode', 'displayUrl', 'carousel_slide_urls', 'archived_slide_urls', 'video_url',
  'raw_json', 'created_at', 'updated_at',
]

const NEEDS_REVIEW_HEADER: (keyof NeedsReviewRow)[] = [
  'review_id', 'source_name', 'source_event_id', 'source_url', 'owner_username', 'caption',
  'description_short', 'description_long', 'validation_status', 'validation_reasons',
  'confidence_score', 'start_datetime', 'venue_name_raw', 'route', '_raw_caption_ai_text',
  'raw_model_text', 'created_at', 'thumbnail_url', 'stored_image_url', 'image_storage_path',
  'image_error', 'verification_verdict', 'verification_notes', 'verification_sources',
  'suggested_corrections',
]

const PROCESSED_HEADER: (keyof ProcessedEventRow)[] = [
  'event_id', 'source_name', 'source_event_id', 'sources', 'source_count', 'source_url',
  'dedupe_key', 'fingerprint', 'title', 'description_short', 'description_long',
  'start_datetime', 'end_datetime', 'timezone', 'is_all_day', 'status', 'venue_id',
  'venue_name', 'venue_name_raw', 'venue_address', 'neighborhood', 'city', 'country',
  'latitude', 'longitude', 'category', 'tags', 'price_min', 'price_max', 'currency',
  'is_free', 'age_restriction', 'language', 'ticket_url', 'primary_image_url',
  'confidence_score', 'first_seen_at', 'last_seen_at', 'changed_at', 'created_at',
  'updated_at', '_raw_model_text', 'post_pattern', 'extraction_source', 'on_slide_text_evidence',
]

const VERIFICATION_HEADER: (keyof VerificationLogRow)[] = [
  'event_id', 'title', 'start_datetime', 'venue_name', 'source_url', 'verdict', 'confidence',
  'title_ok', 'datetime_ok', 'venue_ok', 'notes', 'suggested_corrections', 'sources',
  'verified_at', 'raw_model_text',
]

const WATCHLIST_HEADER = ['handle', 'type', 'active', 'notes']
const RUN_LOG_HEADER = [
  'run_id', 'started_at', 'finished_at', 'mode', 'handles', 'posts_scraped', 'new_rows',
  'apify_run_id', 'status', 'error',
]

const OUT_DIR = path.join(__dirname, '..', 'out')

function writeLocalCsv(fileBase: string, header: string[], rows: Record<string, string>[]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${fileBase}.csv`)
  const exists = fs.existsSync(file)
  const csv = Papa.unparse(
    rows.map((r) => {
      const ordered: Record<string, string> = {}
      header.forEach((col) => (ordered[col] = r[col] ?? ''))
      return ordered
    }),
    { header: !exists }
  )
  fs.appendFileSync(file, (exists ? '\r\n' : '') + csv, 'utf8')
}

async function writeRows(
  tab: string,
  header: string[],
  rows: Record<string, string>[],
  dryRun: boolean
): Promise<number> {
  if (rows.length === 0) return 0
  if (dryRun || !isSheetsConfigured()) {
    writeLocalCsv(tab.replace(/\s+/g, '_'), header, rows)
    return rows.length
  }
  return appendRows(tab, header, rows)
}

/** Read a tab's rows; returns [] when the tab is missing or Sheets is unconfigured. */
export async function readTabSafe(tabName: string): Promise<Record<string, string>[]> {
  if (!isSheetsConfigured()) return []
  try {
    const { rows } = await readTab(tabName)
    return rows
  } catch {
    return []
  }
}

// ---- Watchlist ----

export async function readWatchlist(): Promise<WatchlistEntry[]> {
  const rows = await readTabSafe(TAB_WATCHLIST)
  return rows
    .map((r) => ({
      handle: (r.handle ?? '').trim().replace(/^@/, '').toLowerCase(),
      type: (r.type ?? 'venue').trim().toLowerCase() === 'promoter' ? 'promoter' as const : 'venue' as const,
      active: !['false', '0', 'no'].includes((r.active ?? 'true').trim().toLowerCase()),
      notes: r.notes,
    }))
    .filter((e) => e.handle.length > 0)
}

// ---- Events_Raw ----

export async function readExistingRawIds(): Promise<Set<string>> {
  const rows = await readTabSafe(TAB_EVENTS_RAW)
  return new Set(rows.map((r) => (r.source_event_id ?? '').trim()).filter(Boolean))
}

export async function readEventsRaw(): Promise<Record<string, string>[]> {
  return readTabSafe(TAB_EVENTS_RAW)
}

export async function appendEventsRaw(rows: EventsRawRow[], dryRun = false): Promise<number> {
  return writeRows(TAB_EVENTS_RAW, EVENTS_RAW_HEADER as string[], rows as unknown as Record<string, string>[], dryRun)
}

// ---- Needs_Review / Processed ----

export async function appendNeedsReview(rows: NeedsReviewRow[], dryRun = false): Promise<number> {
  return writeRows(TAB_NEEDS_REVIEW, NEEDS_REVIEW_HEADER as string[], rows as unknown as Record<string, string>[], dryRun)
}

export async function appendProcessed(rows: ProcessedEventRow[], dryRun = false): Promise<number> {
  return writeRows(TAB_PROCESSED, PROCESSED_HEADER as string[], rows as unknown as Record<string, string>[], dryRun)
}

export async function readProcessedFingerprints(): Promise<Set<string>> {
  const rows = await readTabSafe(TAB_PROCESSED)
  return new Set(rows.map((r) => (r.fingerprint ?? '').trim()).filter(Boolean))
}

export async function readProcessedEvents(): Promise<ProcessedEventRow[]> {
  const rows = await readTabSafe(TAB_PROCESSED)
  return rows as unknown as ProcessedEventRow[]
}

export async function appendVerificationLog(rows: VerificationLogRow[], dryRun = false): Promise<number> {
  return writeRows(
    TAB_VERIFICATION,
    VERIFICATION_HEADER as string[],
    rows as unknown as Record<string, string>[],
    dryRun
  )
}

export async function readVerifiedEventIds(): Promise<Set<string>> {
  const rows = await readTabSafe(TAB_VERIFICATION)
  return new Set(rows.map((r) => (r.event_id ?? '').trim()).filter(Boolean))
}

// ---- Run_Log ----

export async function readLastSuccessfulRunAt(): Promise<string | null> {
  const rows = await readTabSafe(TAB_RUN_LOG)
  const successes = rows
    .filter((r) => r.status === 'success' && r.started_at)
    .map((r) => r.started_at)
    .sort()
  return successes.length > 0 ? successes[successes.length - 1] : null
}

export async function appendRunLog(entry: RunLogEntry, dryRun = false): Promise<void> {
  await writeRows(
    TAB_RUN_LOG,
    RUN_LOG_HEADER,
    [{ ...entry, posts_scraped: String(entry.posts_scraped), new_rows: String(entry.new_rows) }],
    dryRun
  )
}
