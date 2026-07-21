/**
 * Google Sheets helpers for the Next.js admin (Fontes IG + Processed Events).
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
const TAB_WATCHLIST_LEGACY = 'Watchlist'
const TAB_PROCESSED = 'Processed Events'

const PROCESSED_HEADER = [
  'event_id', 'source_name', 'source_event_id', 'sources', 'source_count', 'source_url',
  'dedupe_key', 'fingerprint', 'title', 'description_short', 'description_long',
  'start_datetime', 'end_datetime', 'timezone', 'is_all_day', 'status', 'venue_id',
  'venue_name', 'venue_name_raw', 'venue_address', 'neighborhood', 'city', 'country',
  'latitude', 'longitude', 'category', 'tags', 'price_min', 'price_max', 'currency',
  'is_free', 'age_restriction', 'language', 'ticket_url', 'primary_image_url',
  'confidence_score', 'first_seen_at', 'last_seen_at', 'changed_at', 'created_at',
  'updated_at', '_raw_model_text', 'post_pattern', 'extraction_source', 'on_slide_text_evidence',
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

function mapRowsToWatchlist(rows: Record<string, string>[]): WatchlistRow[] {
  const out: WatchlistRow[] = []
  rows.forEach((r, i) => {
    const e = rowToWatchlistEntry(r)
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
  let rows: Record<string, string>[] = []
  let apiError: string | null = null

  if (isAppSheetsWriteConfigured()) {
    try {
      ;({ rows } = await readTab(TAB_WATCHLIST))
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err)
      rows = []
    }
    if (rows.length === 0) {
      try {
        ;({ rows } = await readTab(TAB_WATCHLIST_LEGACY))
      } catch (err) {
        if (!apiError) apiError = err instanceof Error ? err.message : String(err)
        rows = []
      }
    }
  }

  if (rows.length === 0) {
    for (const tab of [TAB_WATCHLIST, TAB_WATCHLIST_LEGACY]) {
      try {
        rows = await readTabViaPublicCsv(tab)
        if (rows.length > 0) break
      } catch (err) {
        if (!apiError) apiError = err instanceof Error ? err.message : String(err)
      }
    }
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

export async function readProcessedFromSheets(limit = 200): Promise<Record<string, string>[]> {
  const { rows } = await readTab(TAB_PROCESSED)
  return rows.slice(-limit).reverse()
}

export async function appendProcessedToSheets(row: Record<string, string>): Promise<void> {
  const api = await getSheets()
  const existing = await api.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `'${TAB_PROCESSED}'!1:1`,
  })
  let header = (existing.data.values?.[0] ?? []).map(String)
  if (header.length === 0) {
    header = [...PROCESSED_HEADER]
    await api.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: `'${TAB_PROCESSED}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    })
  }
  const values = [header.map((col) => row[col] ?? '')]
  await api.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `'${TAB_PROCESSED}'`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
}
