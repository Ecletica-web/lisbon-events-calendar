/**
 * Deterministic field salvage before validation.
 * Prefer fixing overnight times / placeholder URLs over rejecting the whole row.
 */

import type { ExtractedEvent } from '../types'

export type RepairCode =
  | 'fixed_24h_time'
  | 'overnight_end_rollover'
  | 'cleared_placeholder_ticket_url'
  | 'cleared_free_price_conflict'
  | 'dropped_zero_duration_end'

export interface RepairResult {
  event: ExtractedEvent
  repairs: RepairCode[]
}

const PLACEHOLDER_HOST_RE =
  /(?:^|\.)example\.com$|(?:^|\.)example\.org$|(?:^|\.)placeholder\.|picsum\.photos|placehold\.it|\.\.\./i

function parseDateParts(iso: string): { date: string; time: string } | null {
  const m = iso.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  return { date: m[1], time: `${m[2]}:${m[3]}` }
}

/** Fix illegal hour 24 → 00:00 next calendar day (keeps rest of ISO if present). */
export function fixTwentyFourHour(iso: string): { value: string; fixed: boolean } {
  const m = iso.trim().match(/^(\d{4}-\d{2}-\d{2})[T ]24:(\d{2})(?::(\d{2}))?(.*)$/)
  if (!m) return { value: iso, fixed: false }
  const [y, mo, d] = m[1].split('-').map(Number)
  const nextDate = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10)
  const sec = m[3] ?? '00'
  const rest = m[4] ?? ''
  const suffix = /[Z+\-]/.test(rest) ? rest : ''
  return { value: `${nextDate}T00:${m[2]}:${sec}${suffix}`, fixed: true }
}

function addOneDaySameTime(iso: string): string | null {
  const parts = parseDateParts(iso)
  if (!parts) {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString()
  }
  const [y, mo, d] = parts.date.split('-').map(Number)
  const nextDate = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10)
  const timeMatch = iso.match(/[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?)$/)
  return `${nextDate}T${timeMatch ? timeMatch[1] : `${parts.time}:00`}`
}

export function isBadTicketUrl(url: string | undefined | null): boolean {
  const u = (url ?? '').trim()
  if (!u) return false
  if (u === '...' || u.includes('…')) return true
  if (!/^https?:\/\//i.test(u)) return true
  try {
    const parsed = new URL(u)
    if (PLACEHOLDER_HOST_RE.test(parsed.hostname)) return true
    if (/^\/?(lemonella|miro|example)\b/i.test(parsed.pathname) && parsed.hostname.includes('example')) {
      return true
    }
    return false
  } catch {
    return true
  }
}

/**
 * Mutates a copy of the event with deterministic repairs. Original is not modified.
 */
export function autoRepairEvent(input: ExtractedEvent): RepairResult {
  const event: ExtractedEvent = { ...input, tags: [...(input.tags ?? [])] }
  const repairs: RepairCode[] = []

  if (event.start_datetime) {
    const fixed = fixTwentyFourHour(event.start_datetime)
    if (fixed.fixed) {
      event.start_datetime = fixed.value
      repairs.push('fixed_24h_time')
    }
  }
  if (event.end_datetime) {
    const fixed = fixTwentyFourHour(event.end_datetime)
    if (fixed.fixed) {
      event.end_datetime = fixed.value
      repairs.push('fixed_24h_time')
    }
  }

  const start = event.start_datetime ? new Date(event.start_datetime) : null
  const end = event.end_datetime ? new Date(event.end_datetime) : null

  if (start && !isNaN(start.getTime()) && end && !isNaN(end.getTime())) {
    if (end.getTime() === start.getTime()) {
      event.end_datetime = undefined
      repairs.push('dropped_zero_duration_end')
    } else if (end.getTime() < start.getTime()) {
      const startParts = event.start_datetime ? parseDateParts(event.start_datetime) : null
      const endParts = event.end_datetime ? parseDateParts(event.end_datetime) : null
      const startHour = startParts ? parseInt(startParts.time.slice(0, 2), 10) : start.getUTCHours()
      const sameCalendarDay =
        startParts && endParts ? startParts.date === endParts.date : start.toDateString() === end.toDateString()
      // Club overnight: late start + earlier clock time on same listed day
      if (sameCalendarDay && startHour >= 20) {
        const rolled = addOneDaySameTime(event.end_datetime!)
        if (rolled) {
          event.end_datetime = rolled
          repairs.push('overnight_end_rollover')
        }
      }
    }
  }

  if (isBadTicketUrl(event.ticket_url)) {
    event.ticket_url = undefined
    repairs.push('cleared_placeholder_ticket_url')
  }

  if (event.is_free === true && event.price_min != null && event.price_min > 0) {
    event.is_free = undefined
    repairs.push('cleared_free_price_conflict')
  }

  return { event, repairs }
}
