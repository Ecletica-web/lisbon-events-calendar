/**
 * Google Sheets helpers for the Next.js admin (Watchlist + Processed Events).
 * Uses the same service-account env vars as the pipeline.
 * googleapis is loaded dynamically so Vercel/webpack does not bundle it at build time.
 */

import * as fs from 'fs'
import type { sheets_v4 } from 'googleapis'

const TAB_WATCHLIST = 'Watchlist'
const TAB_PROCESSED = 'Processed Events'

const WATCHLIST_HEADER = ['handle', 'type', 'active', 'notes']

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

export function isAppSheetsConfigured(): boolean {
  return !!(process.env.GOOGLE_SHEETS_ID && process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON)
}

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (sheetsApi) return sheetsApi
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
  const id = process.env.GOOGLE_SHEETS_ID
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
  return process.env.GOOGLE_SHEETS_ID!
}

export function getSheetsEditUrl(): string | null {
  const id = process.env.GOOGLE_SHEETS_ID
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null
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
  rowIndex: number
}

export async function readWatchlistFromSheets(): Promise<WatchlistRow[]> {
  const { rows } = await readTab(TAB_WATCHLIST)
  return rows
    .map((r, i) => ({
      handle: (r.handle ?? '').trim().replace(/^@/, '').toLowerCase(),
      type: (r.type ?? 'venue').trim().toLowerCase() || 'venue',
      active: !['false', '0', 'no'].includes((r.active ?? 'true').trim().toLowerCase()),
      notes: r.notes ?? '',
      rowIndex: i + 2,
    }))
    .filter((e) => e.handle.length > 0)
}

/** Replace entire Watchlist tab contents (header + rows). */
export async function writeWatchlistToSheets(
  entries: Array<{ handle: string; type: string; active: boolean; notes?: string }>
): Promise<void> {
  const api = await getSheets()
  const values = [
    WATCHLIST_HEADER,
    ...entries.map((e) => [
      e.handle.replace(/^@/, '').toLowerCase(),
      e.type === 'promoter' ? 'promoter' : 'venue',
      e.active ? 'true' : 'false',
      e.notes ?? '',
    ]),
  ]
  await api.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range: `'${TAB_WATCHLIST}'`,
  })
  await api.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `'${TAB_WATCHLIST}'!A1`,
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
