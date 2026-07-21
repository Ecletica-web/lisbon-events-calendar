/**
 * Google Sheets client — service-account auth + generic tab read/append/ensure.
 * The spreadsheet is the pipeline store: Events_Raw, Needs_Review, Processed Events,
 * Watchlist, Run_Log tabs.
 */

import * as fs from 'fs'
import { google, sheets_v4 } from 'googleapis'
import { getConfig, requireConfig } from '../config'

let sheetsApi: sheets_v4.Sheets | null = null

function loadServiceAccount(raw: string): Record<string, unknown> {
  // Accept either inline JSON or a path to a JSON key file
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  return JSON.parse(fs.readFileSync(trimmed, 'utf8'))
}

export function getSheetsApi(): sheets_v4.Sheets {
  if (sheetsApi) return sheetsApi
  const credentials = loadServiceAccount(
    requireConfig('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON', 'Google Sheets store')
  )
  const auth = new google.auth.GoogleAuth({
    credentials: credentials as { client_email: string; private_key: string },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  sheetsApi = google.sheets({ version: 'v4', auth })
  return sheetsApi
}

export function getSpreadsheetId(): string {
  return requireConfig('GOOGLE_SHEETS_ID', 'Google Sheets store')
}

export interface TabData {
  header: string[]
  rows: Record<string, string>[]
}

export async function tabExists(tabName: string): Promise<boolean> {
  const api = getSheetsApi()
  const meta = await api.spreadsheets.get({ spreadsheetId: getSpreadsheetId() })
  return (meta.data.sheets ?? []).some((s) => s.properties?.title === tabName)
}

/** Create tab with header row if it does not exist; write header if tab is empty. */
export async function ensureTab(tabName: string, header: string[]): Promise<string[]> {
  const api = getSheetsApi()
  const spreadsheetId = getSpreadsheetId()

  if (!(await tabExists(tabName))) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    })
  }

  const existing = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!1:1`,
  })
  const existingHeader = (existing.data.values?.[0] ?? []).map(String)
  if (existingHeader.length === 0) {
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    })
    return header
  }
  return existingHeader
}

export async function readTab(tabName: string): Promise<TabData> {
  const api = getSheetsApi()
  const res = await api.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
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

/**
 * Append object rows, mapping keys onto the tab's existing header.
 * Keys not present in the header are dropped (the header is the contract).
 */
export async function appendRows(
  tabName: string,
  canonicalHeader: string[],
  objects: Record<string, string>[]
): Promise<number> {
  if (objects.length === 0) return 0
  const header = await ensureTab(tabName, canonicalHeader)
  const api = getSheetsApi()
  const values = objects.map((obj) => header.map((col) => obj[col] ?? ''))
  await api.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `'${tabName}'`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
  return objects.length
}

export function isSheetsConfigured(): boolean {
  const cfg = getConfig()
  return Boolean(cfg.GOOGLE_SHEETS_ID && cfg.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON)
}

/** Writes to Sheets (Processed, Venues, Run_Log) — off by default (manual sheet edits). */
export function isSheetsWriteEnabled(): boolean {
  return isSheetsConfigured() && Boolean(getConfig().PIPELINE_SHEETS_WRITE)
}

/** Spreadsheet id from env or derived from venues/events CSV URL. */
export function resolveSpreadsheetId(): string | null {
  const cfg = getConfig()
  if (cfg.GOOGLE_SHEETS_ID?.trim()) return cfg.GOOGLE_SHEETS_ID.trim()
  const csvUrl = cfg.NEXT_PUBLIC_VENUES_CSV_URL || process.env.NEXT_PUBLIC_EVENTS_CSV_URL || ''
  const m = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m?.[1] ?? null
}
