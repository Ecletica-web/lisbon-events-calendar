/**
 * Quarantine unsafe Events Clean New rows (mechanical isPublishSafe invariants).
 *
 * Usage (from pipeline/):
 *   npx tsx scripts/quarantine-publish-unsafe.ts           # dry-run report
 *   npx tsx scripts/quarantine-publish-unsafe.ts --apply   # archive + requeue future
 *
 * Past-dated unsafe → archive only.
 * Future-dated unsafe → archive + append Needs_Review for human recovery.
 */

import * as fs from 'fs'
import * as path from 'path'
import Papa from 'papaparse'
import { isPublishSafe } from '../qualification/publish-safe'
import {
  TAB_EVENTS_CLEAN,
  TAB_NEEDS_REVIEW,
  appendNeedsReview,
  readEventsClean,
  readTabSafe,
} from '../sinks/sheets-writer'
import {
  appendRows,
  getSheetsApi,
  getSpreadsheetId,
  isSheetsConfigured,
  isSheetsWriteEnabled,
} from '../sinks/sheets-client'
import type { NeedsReviewRow } from '../types'

const TAB_ARCHIVE = 'Events Clean Quarantine'
const apply = process.argv.includes('--apply')
const OUT = path.join(__dirname, '..', 'out')

function toReviewRow(row: Record<string, string>, reasons: string[]): NeedsReviewRow {
  return {
    review_id: `rev_quar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source_name: row.source_name || '',
    source_event_id: row.source_event_id || row.event_id || '',
    source_url: row.source_url || '',
    owner_username: row.source_name || '',
    caption: '',
    description_short: row.title || '',
    description_long: row.description_long || row.description_short || '',
    validation_status: 'review',
    validation_reasons: `quarantine|${reasons.join('|')}`,
    confidence_score: row.confidence_score || '',
    start_datetime: row.start_datetime || '',
    venue_name_raw: row.venue_name_raw || row.venue_name || '',
    route: 'needs_review',
    _raw_caption_ai_text: '',
    raw_model_text: '',
    created_at: new Date().toISOString(),
    thumbnail_url: '',
    stored_image_url: row.primary_image_url || '',
    image_storage_path: '',
    image_error: '',
    verification_verdict: '',
    verification_notes: '',
    verification_sources: '',
    suggested_corrections: '',
  }
}

async function ensureArchiveHeader(header: string[]): Promise<void> {
  if (!isSheetsConfigured() || !isSheetsWriteEnabled()) return
  const existing = await readTabSafe(TAB_ARCHIVE)
  if (existing.length > 0) return
  const sheets = getSheetsApi()
  const spreadsheetId = getSpreadsheetId()
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB_ARCHIVE } } }],
      },
    })
  } catch {
    /* may already exist */
  }
  await appendRows(TAB_ARCHIVE, header, [
    Object.fromEntries(header.map((h) => [h, h])),
  ])
}

async function rewriteCleanTab(header: string[], keep: Record<string, string>[]): Promise<void> {
  const sheets = getSheetsApi()
  const spreadsheetId = getSpreadsheetId()
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${TAB_EVENTS_CLEAN}'`,
  })
  const values = [
    header,
    ...keep.map((r) => header.map((h) => r[h] ?? '')),
  ]
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB_EVENTS_CLEAN}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  })
}

async function main(): Promise<void> {
  const clean = await readEventsClean()
  const now = new Date()
  const reasonCounts: Record<string, number> = {}
  const unsafe: Array<{ row: Record<string, string>; reasons: string[]; future: boolean }> = []
  const keep: Record<string, string>[] = []

  for (const row of clean) {
    const safety = isPublishSafe(row, { now })
    if (safety.safe) {
      keep.push(row)
      continue
    }
    for (const r of safety.reasons) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1
    const start = row.start_datetime ? new Date(row.start_datetime) : null
    const future = Boolean(start && !isNaN(start.getTime()) && start.getTime() >= now.getTime())
    unsafe.push({ row, reasons: safety.reasons, future })
  }

  const futureCount = unsafe.filter((u) => u.future).length
  const pastCount = unsafe.length - futureCount

  console.log(`[quarantine] clean_total=${clean.length} safe=${keep.length} unsafe=${unsafe.length} (future=${futureCount} past=${pastCount})`)
  console.log(`[quarantine] reasons=${JSON.stringify(reasonCounts)}`)
  console.log(`[quarantine] mode=${apply ? 'APPLY' : 'dry-run'}`)

  fs.mkdirSync(OUT, { recursive: true })
  const reportPath = path.join(OUT, `quarantine-report-${Date.now()}.csv`)
  const reportRows = unsafe.map(({ row, reasons, future }) => ({
    event_id: row.event_id || '',
    title: row.title || '',
    start_datetime: row.start_datetime || '',
    venue_id: row.venue_id || '',
    venue_name: row.venue_name || '',
    future: String(future),
    reasons: reasons.join('|'),
  }))
  fs.writeFileSync(reportPath, Papa.unparse(reportRows), 'utf8')
  console.log(`[quarantine] wrote ${reportPath}`)

  if (!apply) {
    console.log('[quarantine] re-run with --apply to archive unsafe rows and requeue future ones')
    return
  }

  if (!isSheetsWriteEnabled()) {
    console.error('[quarantine] PIPELINE_SHEETS_WRITE not enabled — aborting apply')
    process.exit(1)
  }

  const header = clean.length
    ? Object.keys(clean[0])
    : ['event_id', 'title', 'start_datetime', 'venue_id', 'fingerprint']

  await ensureArchiveHeader(header)
  if (unsafe.length) {
    await appendRows(
      TAB_ARCHIVE,
      header,
      unsafe.map(({ row }) => {
        const obj: Record<string, string> = {}
        for (const h of header) obj[h] = row[h] ?? ''
        return obj
      })
    )
  }

  await rewriteCleanTab(header, keep)

  const reviewRows = unsafe.filter((u) => u.future).map((u) => toReviewRow(u.row, u.reasons))
  if (reviewRows.length) {
    await appendNeedsReview(reviewRows, false)
    console.log(`[quarantine] requeued ${reviewRows.length} future row(s) → ${TAB_NEEDS_REVIEW}`)
  }

  console.log(`[quarantine] done: Clean now ${keep.length} rows; archived ${unsafe.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
