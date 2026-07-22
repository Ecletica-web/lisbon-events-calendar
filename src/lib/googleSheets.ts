/**
 * Google Sheets helpers for the Next.js admin (Fontes IG + Processed Events + Events Clean New).
 * Uses the same service-account env vars as the pipeline.
 * googleapis is loaded dynamically so Vercel/webpack does not bundle it at build time.
 *
 * Fontes IG can be *read* via public CSV export when the sheet is shared as
 * "Anyone with the link" (same as the calendar CSV URLs). Writes still need a
 * service account.
 */

import * as fs from 'fs'
import Papa from 'papaparse'
import type { sheets_v4 } from 'googleapis'
import {
  FONTES_IG_HEADER,
  rowToWatchlistEntry,
  watchlistEntriesToFontesRows,
} from '@/lib/fontesIgWatchlist'

const TAB_WATCHLIST = 'Fontes IG'
/** Preferred source-of-truth tabs (type is forced from the tab name). */
const TAB_FONTES_VENUES = 'Fontes IG - Venues'
const TAB_FONTES_PROMOTERS = 'Fontes IG - Promoters'
const TAB_WATCHLIST_LEGACY = 'Watchlist'
const TAB_PROCESSED = 'Processed Events'
const TAB_EVENTS_CLEAN = 'Events Clean New'

const PROCESSED_HEADER = [
  'event_id', 'source_name', 'source_event_id', 'sources', 'source_count', 'source_url',
  'dedupe_key', 'fingerprint', 'title', 'description_short', 'description_long',
  'start_datetime', 'end_datetime', 'timezone', 'is_all_day', 'status', 'venue_id',
  'venue_name', 'venue_name_raw', 'venue_address', 'neighborhood', 'city', 'region',
  'country', 'postal_code', 'latitude', 'longitude', 'category', 'tags', 'price_min',
  'price_max', 'currency', 'is_free', 'age_restriction', 'language', 'ticket_url',
  'primary_image_url', 'image_credit', 'confidence_score', 'first_seen_at', 'last_seen_at',
  'changed_at', 'change_hash', 'created_at', 'updated_at', '_error', '_raw_model_text',
  'promoter_id', 'promoter_name',
]

let sheetsApi: sheets_v4.Sheets | null = null

function loadServiceAccount(raw: string): { client_email: string; private_key: string } {
  const trimmed = raw.trim()
  const json = trimmed.startsWith('{')
    ? JSON.parse(trimmed)
    : JSON.parse(fs.readFileSync(trimmed, 'utf8'))
  return json
}

/** Sheet id from env, or derived from NEXT_PUBLIC_EVENTS_CSV_URL. */
export function resolveSpreadsheetId(): string | null {
  const direct = process.env.GOOGLE_SHEETS_ID?.trim()
  if (direct) return direct
  const csvUrl = process.env.NEXT_PUBLIC_EVENTS_CSV_URL || ''
  const m = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m?.[1] ?? null
}

/** True when service account can read/write via Sheets API. */
export function isAppSheetsWriteConfigured(): boolean {
  return !!(resolveSpreadsheetId() && process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON)
}

/** @deprecated Prefer isAppSheetsWriteConfigured / resolveSpreadsheetId */
export function isAppSheetsConfigured(): boolean {
  return isAppSheetsWriteConfigured()
}

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (sheetsApi) return sheetsApi
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
  const id = resolveSpreadsheetId()
  if (!raw || !id) throw new Error('GOOGLE_SHEETS_ID / GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON not configured')
  const { google } = await import('googleapis')
  const credentials = loadServiceAccount(raw)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  sheetsApi = google.sheets({ version: 'v4', auth })
  return sheetsApi
}

function spreadsheetId(): string {
  const id = resolveSpreadsheetId()
  if (!id) throw new Error('GOOGLE_SHEETS_ID not configured')
  return id
}

export function getSheetsEditUrl(): string | null {
  const id = resolveSpreadsheetId()
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null
}

async function tabExists(tabName: string): Promise<boolean> {
  const api = await getSheets()
  const meta = await api.spreadsheets.get({ spreadsheetId: spreadsheetId() })
  return (meta.data.sheets ?? []).some((s) => s.properties?.title === tabName)
}

async function readTab(tabName: string): Promise<{ header: string[]; rows: Record<string, string>[] }> {
  const api = await getSheets()
  const res = await api.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `'${tabName}'`,
  })
  const values = res.data.values ?? []
  if (values.length === 0) return { header: [], rows: [] }
  const header = values[0].map(String)
  const rows = values.slice(1).map((rowValues) => {
    const row: Record<string, string> = {}
    header.forEach((col, i) => {
      row[col] = rowValues[i] != null ? String(rowValues[i]) : ''
    })
    return row
  })
  return { header, rows }
}

export interface WatchlistRow {
  handle: string
  type: string
  active: boolean
  notes: string
  name?: string
  venueType?: string
  eventTypes?: string
  rowIndex: number
}

function mapRowsToWatchlist(
  rows: Record<string, string>[],
  forceType?: 'venue' | 'promoter'
): WatchlistRow[] {
  const out: WatchlistRow[] = []
  rows.forEach((r, i) => {
    const e = rowToWatchlistEntry(r, forceType)
    if (!e) return
    out.push({
      handle: e.handle,
      type: e.type,
      active: e.active,
      notes: e.notes,
      name: e.name,
      venueType: e.venueType,
      eventTypes: e.eventTypes,
      rowIndex: i + 2,
    })
  })
  return out
}

async function readTabRows(tabName: string): Promise<{ rows: Record<string, string>[]; error: string | null }> {
  let error: string | null = null
  if (isAppSheetsWriteConfigured()) {
    try {
      const { rows } = await readTab(tabName)
      if (rows.length > 0) return { rows, error: null }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
  try {
    const rows = await readTabViaPublicCsv(tabName)
    return { rows, error: rows.length === 0 ? error : null }
  } catch (err) {
    return { rows: [], error: error || (err instanceof Error ? err.message : String(err)) }
  }
}

/** Public gviz CSV export (works when sheet is link-shared, no service account). */
async function readTabViaPublicCsv(tabName: string): Promise<Record<string, string>[]> {
  const id = resolveSpreadsheetId()
  if (!id) throw new Error('No spreadsheet id (set GOOGLE_SHEETS_ID or NEXT_PUBLIC_EVENTS_CSV_URL)')
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Public CSV fetch failed for "${tabName}" (HTTP ${res.status})`)
  const text = await res.text()
  // gviz returns HTML error page when tab missing / sheet private
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Public CSV for "${tabName}" unavailable (sheet private or tab missing)`)
  }
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })
  return (parsed.data || []).map((row) => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) out[k] = v == null ? '' : String(v)
    return out
  })
}

export async function readWatchlistFromSheets(): Promise<WatchlistRow[]> {
  // Prefer split tabs (source of truth for type + handles)
  const venues = await readTabRows(TAB_FONTES_VENUES)
  const promoters = await readTabRows(TAB_FONTES_PROMOTERS)
  if (venues.rows.length > 0 || promoters.rows.length > 0) {
    const byHandle = new Map<string, WatchlistRow>()
    for (const row of mapRowsToWatchlist(venues.rows, 'venue')) {
      if (!byHandle.has(row.handle)) byHandle.set(row.handle, row)
    }
    for (const row of mapRowsToWatchlist(promoters.rows, 'promoter')) {
      if (!byHandle.has(row.handle)) byHandle.set(row.handle, row)
    }
    return [...byHandle.values()]
  }

  let rows: Record<string, string>[] = []
  let apiError: string | null = venues.error || promoters.error

  for (const tab of [TAB_WATCHLIST, TAB_WATCHLIST_LEGACY]) {
    const got = await readTabRows(tab)
    if (got.rows.length > 0) {
      rows = got.rows
      apiError = null
      break
    }
    if (!apiError) apiError = got.error
  }

  const mapped = mapRowsToWatchlist(rows)
  if (mapped.length === 0 && apiError) {
    throw new Error(apiError)
  }
  return mapped
}

/** Replace Fontes IG tab contents (Fontes IG layout + Active column). */
export async function writeWatchlistToSheets(
  entries: Array<{
    handle: string
    type: string
    active: boolean
    notes?: string
    name?: string
    venueType?: string
    eventTypes?: string
  }>
): Promise<void> {
  const api = await getSheets()
  const tab = (await tabExists(TAB_WATCHLIST)) ? TAB_WATCHLIST : TAB_WATCHLIST_LEGACY
  const values = [FONTES_IG_HEADER, ...watchlistEntriesToFontesRows(entries)]
  await api.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range: `'${tab}'`,
  })
  await api.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `'${tab}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  })
}

export async function readProcessedFromSheets(limit = 200): Promise<{
  columns: string[]
  rows: Record<string, string>[]
  total: number
}> {
  return readNamedTab(TAB_PROCESSED, limit)
}

/** Events_Raw / Needs_Review legacy tabs (bulk store; admin can still browse via public CSV). */
export async function readEventsRawFromSheets(limit = 200): Promise<{
  columns: string[]
  rows: Record<string, string>[]
  total: number
}> {
  return readNamedTab('Events_Raw', limit)
}

export async function readNeedsReviewFromSheets(limit = 200): Promise<{
  columns: string[]
  rows: Record<string, string>[]
  total: number
}> {
  return readNamedTab('Needs_Review', limit)
}

async function readNamedTab(
  tabName: string,
  limit: number
): Promise<{ columns: string[]; rows: Record<string, string>[]; total: number }> {
  let header: string[] = []
  let rows: Record<string, string>[] = []
  let apiError: string | null = null

  if (isAppSheetsWriteConfigured()) {
    try {
      const tab = await readTab(tabName)
      header = tab.header
      rows = tab.rows
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err)
    }
  }

  if (rows.length === 0) {
    try {
      rows = await readTabViaPublicCsv(tabName)
      header = rows.length > 0 ? Object.keys(rows[0]) : []
    } catch (err) {
      if (!apiError) apiError = err instanceof Error ? err.message : String(err)
    }
  }

  if (rows.length === 0 && apiError) throw new Error(apiError)

  const total = rows.length
  // Prefer newest last rows (sheet append order), then reverse for UI
  const sliced = rows.slice(-limit).reverse()
  const columns =
    header.filter((h) => h.trim() !== '').length > 0
      ? header.filter((h) => h.trim() !== '')
      : sliced.length > 0
        ? Object.keys(sliced[0]).filter((h) => h.trim() !== '')
        : []

  return { columns, rows: sliced, total }
}

export async function appendProcessedToSheets(row: Record<string, string>): Promise<void> {
  await appendRowToTab(TAB_PROCESSED, row)
}

/** Append one approved event to the live calendar sheet (Events Clean New). */
export async function appendEventsCleanToSheets(row: Record<string, string>): Promise<void> {
  await appendRowToTab(TAB_EVENTS_CLEAN, row)
}

async function appendRowToTab(tabName: string, row: Record<string, string>): Promise<void> {
  await appendRowsToTab(tabName, [row])
}

async function appendRowsToTab(tabName: string, rows: Record<string, string>[]): Promise<number> {
  if (rows.length === 0) return 0
  const api = await getSheets()
  const existing = await api.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `'${tabName}'!1:1`,
  })
  let header = (existing.data.values?.[0] ?? []).map(String)
  if (header.length === 0) {
    header = [...PROCESSED_HEADER]
    await api.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    })
  }
  const values = rows.map((row) => header.map((col) => row[col] ?? ''))
  await api.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `'${tabName}'`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
  return rows.length
}

export interface PublishProcessedResult {
  processed: number
  alreadyPublished: number
  published: number
  skippedEmpty: number
}

/**
 * Copy novel rows from Processed Events → Events Clean New (live calendar).
 * Dedupes by event_id + fingerprint only (not source_url — multi-event posts share a URL).
 */
export async function publishProcessedToEventsClean(): Promise<PublishProcessedResult> {
  if (!isAppSheetsWriteConfigured()) {
    throw new Error('Sheets write not configured — set GOOGLE_SHEETS_ID + GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON')
  }

  const processed = await readTab(TAB_PROCESSED)
  const clean = await readTab(TAB_EVENTS_CLEAN)

  const existingIds = new Set(clean.rows.map((r) => (r.event_id ?? '').trim()).filter(Boolean))
  const existingFingerprints = new Set(
    clean.rows.map((r) => (r.fingerprint ?? '').trim()).filter(Boolean)
  )

  let skippedEmpty = 0
  const novel: Record<string, string>[] = []
  for (const row of processed.rows) {
    const eventId = (row.event_id ?? '').trim()
    const fingerprint = (row.fingerprint ?? '').trim()
    if (!eventId && !fingerprint) {
      skippedEmpty++
      continue
    }
    if (
      (eventId && existingIds.has(eventId)) ||
      (fingerprint && existingFingerprints.has(fingerprint))
    ) {
      continue
    }
    novel.push(row)
    if (eventId) existingIds.add(eventId)
    if (fingerprint) existingFingerprints.add(fingerprint)
  }

  const published = await appendRowsToTab(TAB_EVENTS_CLEAN, novel)
  return {
    processed: processed.rows.length,
    alreadyPublished: processed.rows.length - novel.length - skippedEmpty,
    published,
    skippedEmpty,
  }
}
