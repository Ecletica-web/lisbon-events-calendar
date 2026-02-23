/**
 * Admin event review: fetch and parse pipeline CSVs, map rows to card shape.
 * Used only by /admin/event-review. Does not touch main events pipeline.
 */

import Papa from 'papaparse'

const FETCH_TIMEOUT_MS = 15000
const FETCH_MAX_RETRIES = 2

export interface ReviewEventItem {
  id: string
  imageUrl?: string
  title: string
  venueName?: string
  start?: string
  descriptionLong?: string
  validationStatus?: string
  validationReasons?: string
  category?: string
  tags: string[]
  rawRow: Record<string, string>
}

function getStr(row: Record<string, string>, key: string): string {
  const v = row[key]
  return typeof v === 'string' ? v.trim() : ''
}

async function fetchCsvAsRows(url: string): Promise<Record<string, string>[]> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= FETCH_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.statusText}`)
      const csvText = await response.text()
      return new Promise((resolve, reject) => {
        Papa.parse<Record<string, string>>(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (r) => resolve(r.data ?? []),
          error: (e: Error) => reject(e),
        })
      })
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < FETCH_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
  throw lastError ?? new Error('Failed to fetch CSV')
}

function mapRawRow(row: Record<string, string>): ReviewEventItem {
  const id = getStr(row, 'id') || String(Math.random())
  return {
    id,
    imageUrl: getStr(row, 'stored_image_url') || getStr(row, 'thumbnail_url'),
    title: getStr(row, 'caption_event_title') || 'Raw post',
    venueName: getStr(row, 'location_name'),
    start: getStr(row, 'caption_event_start_datetime') || undefined,
    descriptionLong: getStr(row, 'caption'),
    tags: [],
    rawRow: row,
  }
}

function mapNeedsReviewRow(row: Record<string, string>): ReviewEventItem {
  const id = getStr(row, 'review_id') || String(Math.random())
  return {
    id,
    imageUrl: getStr(row, 'stored_image_url') || getStr(row, 'thumbnail_url'),
    title: getStr(row, 'description_short') || 'Needs review',
    venueName: getStr(row, 'venue_name_raw'),
    start: getStr(row, 'start_datetime') || undefined,
    descriptionLong: getStr(row, 'caption'),
    validationStatus: getStr(row, 'validation_status'),
    validationReasons: getStr(row, 'validation_reasons'),
    tags: [],
    rawRow: row,
  }
}

function mapProcessedRow(row: Record<string, string>): ReviewEventItem {
  const id = getStr(row, 'event_id') || String(Math.random())
  const tagsStr = getStr(row, 'tags')
  const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : []
  return {
    id,
    imageUrl: getStr(row, 'primary_image_url'),
    title: getStr(row, 'title') || 'Processed event',
    venueName: getStr(row, 'venue_name') || getStr(row, 'venue_name_raw'),
    start: getStr(row, 'start_datetime') || undefined,
    descriptionLong: getStr(row, 'description_long') || getStr(row, 'description_short'),
    category: getStr(row, 'category') || undefined,
    tags,
    rawRow: row,
  }
}

export type ReviewDataset = 'raw' | 'needsReview' | 'processed'

export interface FetchReviewCsvsResult {
  raw: ReviewEventItem[]
  needsReview: ReviewEventItem[]
  processed: ReviewEventItem[]
}

function parseCsvToRows(csvText: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  return result.data ?? []
}

/** Parse CSV text to raw items (for fallback when reading from project files). */
export function parseRawCsvText(csvText: string): ReviewEventItem[] {
  return parseCsvToRows(csvText).map(mapRawRow)
}

export function parseNeedsReviewCsvText(csvText: string): ReviewEventItem[] {
  return parseCsvToRows(csvText).map(mapNeedsReviewRow)
}

export function parseProcessedCsvText(csvText: string): ReviewEventItem[] {
  return parseCsvToRows(csvText).map(mapProcessedRow)
}

export async function fetchReviewCsvs(): Promise<FetchReviewCsvsResult> {
  const rawUrl = process.env.EVENT_REVIEW_RAW_CSV_URL
  const needsReviewUrl = process.env.EVENT_REVIEW_NEEDS_REVIEW_CSV_URL
  const processedUrl = process.env.EVENT_REVIEW_PROCESSED_CSV_URL

  const [rawRows, needsReviewRows, processedRows] = await Promise.all([
    rawUrl ? fetchCsvAsRows(rawUrl).catch(() => []) : Promise.resolve([]),
    needsReviewUrl ? fetchCsvAsRows(needsReviewUrl).catch(() => []) : Promise.resolve([]),
    processedUrl ? fetchCsvAsRows(processedUrl).catch(() => []) : Promise.resolve([]),
  ])

  return {
    raw: rawRows.map(mapRawRow),
    needsReview: needsReviewRows.map(mapNeedsReviewRow),
    processed: processedRows.map(mapProcessedRow),
  }
}
