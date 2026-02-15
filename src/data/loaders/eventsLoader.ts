/**
 * Events loader — fetches and normalizes events from CSV/Sheets
 */

import Papa from 'papaparse'
import type { Event, EventStatus } from '@/models/Event'
import { isEventVisibleInListing } from '@/models/Event'
import { normalizeEventTags, normalizeBoolean, normalizeNumber, simpleHash } from './utils'
import { resolveEventColumn } from '@/data/schema/eventColumns'
import type { VenueIndex } from '@/data/venueIndex'
import { resolveVenue } from '@/data/venueIndex'

export interface RawEventRow {
  [key: string]: string | number | boolean | string[] | undefined
}

export type QuarantineReason =
  | 'missing_event_id'
  | 'missing_title'
  | 'missing_start_datetime'
  | 'invalid_datetime'
  | 'venue_resolution_failed'
  | 'parse_error'
  | 'unknown'

export interface LoadEventsResult {
  events: Event[]
  quarantined: { row: RawEventRow; error: string; reason: QuarantineReason }[]
  stats: {
    totalRows: number
    loaded: number
    quarantined: number
    duplicatesMerged: number
    unknownVenues: number
  }
}

const DEFAULT_TIMEZONE = 'Europe/Lisbon'

function getRaw(row: RawEventRow, col: string): string | number | boolean | string[] | undefined {
  const resolved = resolveEventColumn(col)
  return row[resolved] ?? row[col]
}

function getStr(row: RawEventRow, col: string): string | undefined {
  const v = getRaw(row, col)
  return v?.toString().trim() || undefined
}

function normalizeStatus(raw?: string): EventStatus {
  if (!raw || typeof raw !== 'string') return 'scheduled'
  const s = raw.trim().toLowerCase()
  const mapping: Record<string, EventStatus> = {
    scheduled: 'scheduled',
    active: 'scheduled',
    needs_review: 'scheduled',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    postponed: 'postponed',
    sold_out: 'sold_out',
    soldout: 'sold_out',
    draft: 'draft',
    archived: 'archived',
  }
  return (mapping[s] ?? 'scheduled') as EventStatus
}

function parseOpeningTimeFromDescription(desc: string | undefined): string | null {
  if (!desc) return null
  const text = String(desc).toLowerCase()
  const rangeMatch = text.match(/\b(\d{1,2}):(\d{2})\s*[-–]\s*\d{1,2}:\d{2}\b/)
  if (rangeMatch) return `${rangeMatch[1].padStart(2, '0')}:${rangeMatch[2]}`
  const opensMatch = text.match(/(?:opens?\s+(?:at\s+)?|daily\s+)(\d{1,2}):(\d{2})\b/)
  if (opensMatch) return `${opensMatch[1].padStart(2, '0')}:${opensMatch[2]}`
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (timeMatch) return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
  const hourMatch = text.match(/\b(\d{1,2})h\b/)
  if (hourMatch) return `${hourMatch[1].padStart(2, '0')}:00`
  return null
}

/** Core fields for change_hash */
function getChangeHashInput(e: {
  title: string
  start_datetime: string
  end_datetime?: string
  venue_id?: string
  status: string
  price_min?: number
  price_max?: number
  ticket_url?: string
}): string {
  return [
    e.title.toLowerCase().trim(),
    e.start_datetime,
    e.end_datetime ?? '',
    e.venue_id ?? '',
    e.status,
    String(e.price_min ?? ''),
    String(e.price_max ?? ''),
    e.ticket_url ?? '',
  ].join('|')
}

/** Normalize title for fingerprint (lowercase, remove emojis/punct, collapse spaces) */
function normalizeTitleForFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\p{Emoji}\p{Symbol}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Date bucket YYYY-MM-DD; time bucket 30-min or "allday" */
function getDateAndTimeBucket(startIso: string, isAllDay: boolean): { date: string; time: string } {
  const d = new Date(startIso)
  const date = startIso.slice(0, 10)
  if (isAllDay) return { date, time: 'allday' }
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const bucket = Math.floor(m / 30) * 30
  const time = `${String(h).padStart(2, '0')}:${String(bucket).padStart(2, '0')}`
  return { date, time }
}

function computeFingerprint(
  title: string,
  startIso: string,
  isAllDay: boolean,
  venueId: string
): string {
  const titleNorm = normalizeTitleForFingerprint(title)
  const { date, time } = getDateAndTimeBucket(startIso, isAllDay)
  const input = `${titleNorm}|${date}|${time}|${venueId}`
  return simpleHash(input)
}

const nowIso = () => new Date().toISOString()

/**
 * Normalize raw CSV row to Event domain object.
 */
export function normalizeEvent(
  raw: RawEventRow,
  venueIndex?: VenueIndex | null,
  allowedEventTags?: string[] | null
): Event | null {
  const eventId = getStr(raw, 'event_id') || getStr(raw, 'id')
  const title = getStr(raw, 'title')
  const startDatetime = getStr(raw, 'start_datetime')

  if (!eventId) return null
  if (!title) return null
  if (!startDatetime) return null

  let startDate: Date
  try {
    startDate = new Date(startDatetime)
    if (isNaN(startDate.getTime())) return null
  } catch {
    return null
  }

  let endDatetime: string | undefined
  const endRaw = getStr(raw, 'end_datetime')
  if (endRaw) {
    try {
      const end = new Date(endRaw)
      if (!isNaN(end.getTime())) endDatetime = end.toISOString()
    } catch {
      // ignore
    }
  }

  const timezone = getStr(raw, 'timezone') || DEFAULT_TIMEZONE
  const wasAllDay = normalizeBoolean(getRaw(raw, 'is_all_day'), false)
  let finalStart = startDate.toISOString()
  let finalEnd = endDatetime

  if (wasAllDay) {
    const startHour = startDate.getUTCHours()
    const startMin = startDate.getUTCMinutes()
    const isMidnight = startHour === 0 && startMin === 0
    if (isMidnight) {
      const sheetOpens = getStr(raw, 'opens_at')
      let parsed: string | null = null
      if (sheetOpens) {
        const m = sheetOpens.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/)
        if (m) parsed = `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`
      }
      if (!parsed) {
        parsed = parseOpeningTimeFromDescription(
          getStr(raw, 'description_short') || getStr(raw, 'description_long')
        )
      }
      const [openH, openM] = (parsed || '10:00').split(':').map(Number)
      const startOnly = new Date(startDate)
      startOnly.setUTCHours(openH, openM || 0, 0, 0)
      finalStart = startOnly.toISOString()
      if (!finalEnd) {
        const endOnly = new Date(startOnly)
        endOnly.setUTCHours(endOnly.getUTCHours() + 1, 0, 0, 0)
        finalEnd = endOnly.toISOString()
      }
    }
  }

  const status = normalizeStatus(getStr(raw, 'status'))
  const tags = normalizeEventTags(getRaw(raw, 'tags'), allowedEventTags, 5)
  const priceMin = normalizeNumber(getRaw(raw, 'price_min'))
  const priceMax = normalizeNumber(getRaw(raw, 'price_max'))
  const latitude = normalizeNumber(getRaw(raw, 'latitude'))
  const longitude = normalizeNumber(getRaw(raw, 'longitude'))
  const confidenceScore = normalizeNumber(getRaw(raw, 'confidence_score'))
  const primaryImageUrl = getStr(raw, 'primary_image_url') || getStr(raw, 'image_url')

  const venueNameRaw = getStr(raw, 'venue_name')
  const venueIdRaw = getStr(raw, 'venue_id')
  const sourceNameRaw = getStr(raw, 'source_name')

  let venue_id: string | undefined
  let venue_name: string | undefined
  let venue_name_raw: string | undefined
  let unknownVenue = false

  if (venueIndex) {
    const res = resolveVenue(venueIndex, venueIdRaw, venueNameRaw, sourceNameRaw)
    if (res.resolved) {
      venue_id = res.venue_id
      venue_name = res.venue_name
    } else {
      venue_id = 'unknown'
      venue_name_raw = res.venue_name_raw
      unknownVenue = true
    }
  } else {
    venue_id = venueIdRaw || undefined
    venue_name = venueNameRaw || undefined
  }

  const changeHashInput = getChangeHashInput({
    title,
    start_datetime: finalStart,
    end_datetime: finalEnd,
    venue_id: venue_id ?? '',
    status,
    price_min: priceMin ?? undefined,
    price_max: priceMax ?? undefined,
    ticket_url: getStr(raw, 'ticket_url'),
  })
  const change_hash = simpleHash(changeHashInput)

  const fingerprint = computeFingerprint(
    title,
    finalStart,
    false,
    venue_id ?? 'unknown'
  )

  const first_seen_at = getStr(raw, 'first_seen_at') || nowIso()
  const last_seen_at = getStr(raw, 'last_seen_at') || nowIso()
  const changed_at = getStr(raw, 'changed_at') || nowIso()
  const source_name = getStr(raw, 'source_name')
  const sources = source_name ? [source_name] : []
  const source_count = sources.length

  const event: Event = {
    event_id: eventId,
    source_name,
    source_event_id: getStr(raw, 'source_event_id'),
    dedupe_key: getStr(raw, 'dedupe_key'),
    title,
    description_short: getStr(raw, 'description_short'),
    description_long: getStr(raw, 'description_long'),
    start_datetime: finalStart,
    end_datetime: finalEnd,
    timezone,
    is_all_day: false,
    status,
    venue_id,
    venue_name,
    venue_name_raw,
    venue_address: getStr(raw, 'venue_address'),
    neighborhood: getStr(raw, 'neighborhood'),
    city: getStr(raw, 'city'),
    region: getStr(raw, 'region'),
    country: getStr(raw, 'country'),
    postal_code: getStr(raw, 'postal_code'),
    latitude: latitude ?? undefined,
    longitude: longitude ?? undefined,
    category: getStr(raw, 'category')?.toLowerCase(),
    tags,
    price_min: priceMin ?? undefined,
    price_max: priceMax ?? undefined,
    currency: getStr(raw, 'currency')?.toUpperCase(),
    is_free: normalizeBoolean(getRaw(raw, 'is_free'), false),
    age_restriction: getStr(raw, 'age_restriction'),
    language: getStr(raw, 'language'),
    ticket_url: getStr(raw, 'ticket_url'),
    primary_image_id: getStr(raw, 'primary_image_id'),
    primary_image_url: primaryImageUrl,
    image_credit: getStr(raw, 'image_credit'),
    source_url: getStr(raw, 'source_url'),
    confidence_score: confidenceScore ?? undefined,
    promoter_id: getStr(raw, 'promoter_id') ?? undefined,
    promoter_name: getStr(raw, 'promoter_name') ?? undefined,
    first_seen_at,
    last_seen_at,
    changed_at,
    change_hash,
    source_count,
    sources,
    fingerprint,
    created_at: getStr(raw, 'created_at'),
    updated_at: getStr(raw, 'updated_at'),
  }

  return event
}

function scoreEvent(e: Event): number {
  let s = 0
  if (e.event_id) s += 100
  if (e.confidence_score != null) s += e.confidence_score * 10
  if (e.ticket_url) s += 2
  if (e.primary_image_url) s += 1
  const descLen = (e.description_short?.length ?? 0) + (e.description_long?.length ?? 0)
  if (descLen > 100) s += 1
  return s
}

/** Dedupe: group by fingerprint; within group pick best row; merge sources. */
export function deduplicateEvents(events: Event[]): Event[] {
  const byFingerprint = new Map<string, Event[]>()

  for (const e of events) {
    const fp = e.fingerprint || simpleHash(`${e.title}|${e.start_datetime}|${e.venue_id ?? ''}`)
    if (!byFingerprint.has(fp)) byFingerprint.set(fp, [])
    byFingerprint.get(fp)!.push(e)
  }

  const result: Event[] = []
  for (const group of byFingerprint.values()) {
    const best = group.reduce((a, b) => (scoreEvent(b) > scoreEvent(a) ? b : a))
    if (group.length > 1) {
      const allSources = new Set<string>()
      let maxSourceCount = 0
      for (const ev of group) {
        ev.sources?.forEach((s) => allSources.add(s))
        if (ev.source_count) maxSourceCount = Math.max(maxSourceCount, ev.source_count)
      }
      best.sources = Array.from(allSources)
      best.source_count = Math.max(best.source_count ?? 0, allSources.size, maxSourceCount)
    }
    const id = best.event_id || best.fingerprint || simpleHash(JSON.stringify(best))
    result.push({ ...best, event_id: best.event_id || id })
  }

  return result
}

export function filterEventsForListing(events: Event[]): Event[] {
  return events.filter((e) => isEventVisibleInListing(e.status))
}

export async function loadEvents(
  csvUrl: string,
  venueIndex?: VenueIndex | null,
  allowedEventTags?: string[] | null
): Promise<LoadEventsResult> {
  const quarantined: { row: RawEventRow; error: string; reason: QuarantineReason }[] = []
  const stats = {
    totalRows: 0,
    loaded: 0,
    quarantined: 0,
    duplicatesMerged: 0,
    unknownVenues: 0,
  }

  const FETCH_TIMEOUT_MS = 15000
  const FETCH_MAX_RETRIES = 2

  const fetchWithTimeoutAndRetry = async (): Promise<string> => {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= FETCH_MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const response = await fetch(csvUrl, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch CSV: ${response.statusText}`)
        }
        return await response.text()
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

  try {
    const csvText = await fetchWithTimeoutAndRetry()
    return new Promise((resolve) => {
      Papa.parse<RawEventRow>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          stats.totalRows = results.data.length
          const events: Event[] = []
          let unknownVenues = 0

          for (const row of results.data) {
            const eventId = getStr(row, 'event_id') || getStr(row, 'id')
            const title = getStr(row, 'title')
            const startDatetime = getStr(row, 'start_datetime')

            let reason: QuarantineReason = 'unknown'
            if (!eventId) reason = 'missing_event_id'
            else if (!title) reason = 'missing_title'
            else if (!startDatetime) reason = 'missing_start_datetime'

            if (reason !== 'unknown') {
              quarantined.push({
                row,
                error: reason.replace(/_/g, ' '),
                reason,
              })
              continue
            }

            try {
              const event = normalizeEvent(row, venueIndex, allowedEventTags)
              if (event) {
                events.push(event)
                if (event.venue_id === 'unknown') unknownVenues++
              } else {
                quarantined.push({
                  row,
                  error: 'Invalid datetime or parse error',
                  reason: 'invalid_datetime',
                })
              }
            } catch {
              quarantined.push({ row, error: 'Parse error', reason: 'parse_error' })
            }
          }

          stats.loaded = events.length
          stats.quarantined = quarantined.length
          stats.unknownVenues = unknownVenues

          const beforeDedupe = events.length
          const deduped = deduplicateEvents(events)
          stats.duplicatesMerged = beforeDedupe - deduped.length

          resolve({
            events: deduped,
            quarantined,
            stats,
          })
        },
        error: (err: Error) => {
          console.error('[eventsLoader] PapaParse error:', err)
          resolve({
            events: [],
            quarantined: [{ row: {}, error: String(err), reason: 'parse_error' }],
            stats: { ...stats, totalRows: 0 },
          })
        },
      })
    })
  } catch (err) {
    console.error('[eventsLoader] Fetch error:', err)
    return {
      events: [],
      quarantined: [{ row: {}, error: String(err), reason: 'parse_error' }],
      stats: { ...stats, totalRows: 0 },
    }
  }
}
