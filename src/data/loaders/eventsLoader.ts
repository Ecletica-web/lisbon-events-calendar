/**
 * Events loader — fetches and normalizes events from CSV/Sheets
 * Supports new schema and backward compatibility with legacy columns.
 */

import Papa from 'papaparse'
import type { Event, EventStatus } from '@/models/Event'
import { isEventVisibleInListing } from '@/models/Event'
import { normalizeTags, normalizeBoolean, normalizeNumber } from './utils'

/** Raw row from CSV — supports new schema + backward compat (id, image_url, etc.) */
export interface RawEventRow {
  [key: string]: string | number | boolean | string[] | undefined

  // New schema
  event_id?: string
  source_name?: string
  source_event_id?: string
  dedupe_key?: string
  title?: string
  description_short?: string
  description_long?: string
  start_datetime?: string
  end_datetime?: string
  timezone?: string
  is_all_day?: string | boolean
  status?: string
  venue_id?: string
  venue_name?: string
  venue_address?: string
  neighborhood?: string
  city?: string
  region?: string
  country?: string
  postal_code?: string
  latitude?: string | number
  longitude?: string | number
  category?: string
  tags?: string | string[]
  price_min?: string | number
  price_max?: string | number
  currency?: string
  is_free?: string | boolean
  age_restriction?: string
  language?: string
  ticket_url?: string
  primary_image_id?: string
  primary_image_url?: string
  image_credit?: string
  source_url?: string
  confidence_score?: string | number
  last_seen_at?: string
  created_at?: string
  updated_at?: string

  // Legacy backward compat
  id?: string
  image_url?: string
  opens_at?: string
  recurrence_rule?: string
}

export interface LoadEventsResult {
  events: Event[]
  quarantined: { row: RawEventRow; error: string }[]
}

const DEFAULT_TIMEZONE = 'Europe/Lisbon'

/** Map legacy/alternate status strings to canonical EventStatus */
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

/**
 * Normalize raw CSV row to Event domain object.
 * Sets _error and returns null if row is invalid (missing required fields).
 */
export function normalizeEvent(raw: RawEventRow): Event | null {
  // Backward compat: id -> event_id
  const eventId = raw.event_id?.toString().trim() || raw.id?.toString().trim()
  const title = raw.title?.toString().trim()
  const startDatetime = raw.start_datetime?.toString().trim()

  if (!eventId || !title || !startDatetime) {
    return null
  }

  const errors: string[] = []

  // Parse dates
  let startDate: Date
  try {
    startDate = new Date(startDatetime)
    if (isNaN(startDate.getTime())) {
      errors.push(`Invalid start_datetime: ${startDatetime}`)
      return null
    }
  } catch {
    errors.push('start_datetime parse failed')
    return null
  }

  let endDatetime: string | undefined
  if (raw.end_datetime) {
    try {
      const end = new Date(raw.end_datetime.toString().trim())
      if (!isNaN(end.getTime())) {
        endDatetime = end.toISOString()
      }
    } catch {
      // ignore
    }
  }

  const timezone = raw.timezone?.toString().trim() || DEFAULT_TIMEZONE
  const wasAllDay = normalizeBoolean(raw.is_all_day, false)
  let finalStart = startDate.toISOString()
  let finalEnd = endDatetime

  // All-day handling: convert to time-bounded using opens_at or parsed time
  if (wasAllDay) {
    const startHour = startDate.getUTCHours()
    const startMin = startDate.getUTCMinutes()
    const isMidnight = startHour === 0 && startMin === 0

    if (isMidnight) {
      const sheetOpens = raw.opens_at?.toString().trim()
      let parsed: string | null = null
      if (sheetOpens) {
        const m = sheetOpens.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/)
        if (m) parsed = `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`
      }
      if (!parsed) {
        parsed = parseOpeningTimeFromDescription(
          (raw.description_short || raw.description_long)?.toString()
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

  const status = normalizeStatus(raw.status?.toString())
  const tags = normalizeTags(raw.tags)
  const priceMin = normalizeNumber(raw.price_min)
  const priceMax = normalizeNumber(raw.price_max)
  const latitude = normalizeNumber(raw.latitude)
  const longitude = normalizeNumber(raw.longitude)
  const confidenceScore = normalizeNumber(raw.confidence_score)

  // Backward compat: image_url -> primary_image_url
  const primaryImageUrl =
    raw.primary_image_url?.toString().trim() || raw.image_url?.toString().trim()

  const event: Event = {
    event_id: eventId,
    source_name: raw.source_name?.toString().trim() || undefined,
    source_event_id: raw.source_event_id?.toString().trim() || undefined,
    dedupe_key: raw.dedupe_key?.toString().trim() || undefined,
    title,
    description_short: raw.description_short?.toString().trim() || undefined,
    description_long: raw.description_long?.toString().trim() || undefined,
    start_datetime: finalStart,
    end_datetime: finalEnd,
    timezone,
    is_all_day: false, // we convert to time-bounded
    status,
    venue_id: raw.venue_id?.toString().trim() || undefined,
    venue_name: raw.venue_name?.toString().trim() || undefined,
    venue_address: raw.venue_address?.toString().trim() || undefined,
    neighborhood: raw.neighborhood?.toString().trim() || undefined,
    city: raw.city?.toString().trim() || undefined,
    region: raw.region?.toString().trim() || undefined,
    country: raw.country?.toString().trim() || undefined,
    postal_code: raw.postal_code?.toString().trim() || undefined,
    latitude: latitude ?? undefined,
    longitude: longitude ?? undefined,
    category: raw.category?.toString().trim().toLowerCase() || undefined,
    tags,
    price_min: priceMin ?? undefined,
    price_max: priceMax ?? undefined,
    currency: raw.currency?.toString().trim().toUpperCase() || undefined,
    is_free: normalizeBoolean(raw.is_free, false),
    age_restriction: raw.age_restriction?.toString().trim() || undefined,
    language: raw.language?.toString().trim() || undefined,
    ticket_url: raw.ticket_url?.toString().trim() || undefined,
    primary_image_id: raw.primary_image_id?.toString().trim() || undefined,
    primary_image_url: primaryImageUrl || undefined,
    image_credit: raw.image_credit?.toString().trim() || undefined,
    source_url: raw.source_url?.toString().trim() || undefined,
    confidence_score: confidenceScore ?? undefined,
    last_seen_at: raw.last_seen_at?.toString().trim() || undefined,
    created_at: raw.created_at?.toString().trim() || undefined,
    updated_at: raw.updated_at?.toString().trim() || undefined,
  }

  if (errors.length > 0) {
    event._error = errors.join('; ')
  }

  return event
}

/** Dedupe strategy: event_id > dedupe_key > (title + start_datetime + venue_id) */
export function deduplicateEvents(events: Event[]): Event[] {
  const byEventId = new Map<string, Event>()
  const byDedupeKey = new Map<string, Event>()
  const byFallback = new Map<string, Event>()

  for (const e of events) {
    if (e.dedupe_key) {
      const existing = byDedupeKey.get(e.dedupe_key)
      if (!existing || shouldKeepNewer(e, existing)) {
        byDedupeKey.set(e.dedupe_key, e)
      }
      continue
    }

    const existingById = byEventId.get(e.event_id)
    if (!existingById || shouldKeepNewer(e, existingById)) {
      byEventId.set(e.event_id, e)
    }

    const venuePart = e.venue_id || e.venue_name || ''
    const fallbackKey = `${e.title}|${e.start_datetime}|${venuePart}`
    const existingFallback = byFallback.get(fallbackKey)
    if (!existingFallback || shouldKeepNewer(e, existingFallback)) {
      byFallback.set(fallbackKey, e)
    }
  }

  const result = new Map<string, Event>()
  for (const e of byDedupeKey.values()) result.set(e.event_id, e)
  for (const e of byEventId.values()) {
    if (!result.has(e.event_id)) result.set(e.event_id, e)
  }
  for (const e of byFallback.values()) {
    if (!result.has(e.event_id)) result.set(e.event_id, e)
  }

  return Array.from(result.values())
}

function shouldKeepNewer(a: Event, b: Event): boolean {
  const aUp = a.updated_at ? new Date(a.updated_at).getTime() : 0
  const bUp = b.updated_at ? new Date(b.updated_at).getTime() : 0
  return aUp >= bUp
}

/** Filter events for default listing (scheduled, sold_out, postponed) */
export function filterEventsForListing(events: Event[]): Event[] {
  return events.filter((e) => isEventVisibleInListing(e.status))
}

/**
 * Load events from CSV URL.
 * Quarantines bad rows; does not throw.
 */
export async function loadEvents(csvUrl: string): Promise<LoadEventsResult> {
  const quarantined: { row: RawEventRow; error: string }[] = []

  try {
    const response = await fetch(csvUrl, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.statusText}`)
    }
    const csvText = await response.text()
    return new Promise((resolve) => {
      Papa.parse<RawEventRow>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const events: Event[] = []
          for (const row of results.data) {
            const event = normalizeEvent(row)
            if (event) {
              events.push(event)
            } else {
              const err =
                !row.event_id && !row.id
                  ? 'Missing event_id/id'
                  : !row.title
                    ? 'Missing title'
                    : !row.start_datetime
                      ? 'Missing start_datetime'
                      : 'Invalid row'
              quarantined.push({ row, error: err })
            }
          }
          const deduped = deduplicateEvents(events)
          resolve({ events: deduped, quarantined })
        },
        error: (err: Error) => {
          console.error('[eventsLoader] PapaParse error:', err)
          resolve({ events: [], quarantined: [{ row: {}, error: String(err) }] })
        },
      })
    })
  } catch (err) {
    console.error('[eventsLoader] Fetch error:', err)
    return { events: [], quarantined: [{ row: {}, error: String(err) }] }
  }
}
