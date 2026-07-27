/**
 * Calendar-day helpers in Europe/Lisbon.
 * Never use `toISOString().split('T')[0]` or `new Date('YYYY-MM-DD')` for UI date keys —
 * those shift the day in WEST (UTC+1) / other offsets east of UTC.
 */

export const LISBON_TZ = 'Europe/Lisbon'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD for an instant in Europe/Lisbon. */
export function lisbonDateKey(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: LISBON_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

/** Parse YYYY-MM-DD as local calendar midnight (not UTC). */
export function parseDateKeyLocal(key: string): Date {
  if (!DATE_KEY_RE.test(key)) {
    const fallback = new Date(key)
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0)
  }
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

export function isDateKey(value: string): boolean {
  return DATE_KEY_RE.test(value)
}

/** Today in Lisbon as YYYY-MM-DD. */
export function lisbonTodayKey(now: Date = new Date()): string {
  return lisbonDateKey(now)
}

/** Add calendar days to a YYYY-MM-DD key (local arithmetic). */
export function addDaysKey(key: string, days: number): string {
  const d = parseDateKeyLocal(key)
  d.setDate(d.getDate() + days)
  return formatLocalDateKey(d)
}

/** First day of month for a key, as YYYY-MM-DD. */
export function startOfMonthKey(key: string): string {
  const d = parseDateKeyLocal(key)
  return formatLocalDateKey(new Date(d.getFullYear(), d.getMonth(), 1))
}

/** First day of next month after key. */
export function startOfNextMonthKey(key: string): string {
  const d = parseDateKeyLocal(key)
  return formatLocalDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1))
}

/** Add months to a date key (clamped to day 1 of target month when used for month nav). */
export function addMonthsKey(key: string, months: number): string {
  const d = parseDateKeyLocal(key)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // If month rolled (e.g. Jan 31 + 1 → Mar), clamp to last day — fine for focus keys
  if (d.getDate() !== day) {
    d.setDate(0)
  }
  return formatLocalDateKey(d)
}

function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Nightlife week: most recent Sunday 19:00 Europe/Lisbon → next Sunday 19:00.
 * Returns half-open [start, end) as Date instants (UTC-backed Date objects).
 */
export function lisbonWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  // Find Lisbon wall time parts for `now`
  const parts = lisbonParts(now)
  // Build a Date that represents "this Lisbon calendar day at 19:00" by binary-searching
  // an UTC instant whose Lisbon formatting is that day 19:00.
  const todayKey = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
  const sundayKey = sundayOnOrBefore(todayKey)
  let weekStart = lisbonWallTimeToUtc(sundayKey, 19, 0)

  // If we're before Sunday 19:00 this week, use previous Sunday 19:00
  if (now.getTime() < weekStart.getTime()) {
    const prevSunday = addDaysKey(sundayKey, -7)
    weekStart = lisbonWallTimeToUtc(prevSunday, 19, 0)
  }

  const weekEndKey = addDaysKey(lisbonDateKey(weekStart), 7)
  // End is next Sunday 19:00 — same clock as start + 7 Lisbon days
  const endSundayKey = sundayOnOrBefore(weekEndKey) === weekEndKey
    ? weekEndKey
    : addDaysKey(sundayOnOrBefore(weekEndKey), 7)
  // Simpler: start + 7 days at 19:00 Lisbon
  const endKey = addDaysKey(lisbonDateKey(weekStart), 7)
  const weekEnd = lisbonWallTimeToUtc(endKey, 19, 0)

  return { start: weekStart, end: weekEnd }
}

/** Start/end of a Lisbon calendar day as Date (local midnight..end for filtering). */
export function lisbonDayBoundsFromKey(key: string): { start: Date; end: Date } {
  const start = parseDateKeyLocal(key)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/** Month bounds for a focus key (local). */
export function lisbonMonthBoundsFromKey(key: string): { start: Date; end: Date } {
  const d = parseDateKeyLocal(key)
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

/**
 * Week bounds for list/calendar when focus is a date key.
 * Uses Sunday 19:00 Lisbon → next Sunday 19:00 containing the focus day
 * (or the nightlife week containing "now" when focus is today).
 */
export function lisbonWeekBoundsFromKey(key: string, now: Date = new Date()): { start: Date; end: Date } {
  // If focus is "today" in Lisbon, use live nightlife week
  if (key === lisbonTodayKey(now)) {
    return lisbonWeekRange(now)
  }
  // Otherwise: week containing that calendar day — Sunday 19:00 of that week
  const sundayKey = sundayOnOrBefore(key)
  const start = lisbonWallTimeToUtc(sundayKey, 19, 0)
  const endKey = addDaysKey(sundayKey, 7)
  const end = lisbonWallTimeToUtc(endKey, 19, 0)
  // Events on Sunday before 19:00 belong to previous week — for display grouping
  // we still include the full Sunday calendar day when focusing mid-week.
  // Product rule: week starts Sunday 19:00, so Sunday daytime is previous week.
  return { start, end }
}

/** Start of "today" in Lisbon as a Date for upcoming filters (local midnight of Lisbon today). */
export function lisbonStartOfToday(now: Date = new Date()): Date {
  return parseDateKeyLocal(lisbonTodayKey(now))
}

export type TimeRangePreset = 'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'nextMonth'

/** Half-open [start, end) or inclusive end for month/day — used by list filters. */
export function getLisbonRangeBounds(
  range: TimeRangePreset,
  now: Date = new Date()
): { start: Date; end: Date } | null {
  const todayKey = lisbonTodayKey(now)
  if (range === 'all') {
    // Upcoming from today — caller may treat end as open
    return { start: parseDateKeyLocal(todayKey), end: new Date(8640000000000000) }
  }
  if (range === 'today') {
    const { start, end } = lisbonDayBoundsFromKey(todayKey)
    return { start, end }
  }
  if (range === 'tomorrow') {
    const tom = addDaysKey(todayKey, 1)
    return lisbonDayBoundsFromKey(tom)
  }
  if (range === 'week') {
    return lisbonWeekRange(now)
  }
  if (range === 'month') {
    return lisbonMonthBoundsFromKey(todayKey)
  }
  if (range === 'nextMonth') {
    const next = startOfNextMonthKey(todayKey)
    return lisbonMonthBoundsFromKey(next)
  }
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function sundayOnOrBefore(key: string): string {
  const d = parseDateKeyLocal(key)
  const day = d.getDay() // 0 = Sunday
  if (day === 0) return key
  return addDaysKey(key, -day)
}

function lisbonParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

/**
 * Find a UTC Date whose Europe/Lisbon wall clock is dateKey at hour:minute.
 * Binary search over a day window.
 */
function lisbonWallTimeToUtc(dateKey: string, hour: number, minute: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  // Approx: Lisbon is UTC+0 or +1 — start from UTC noon that calendar day and search
  let lo = Date.UTC(y, m - 1, d, 0, 0, 0) - 2 * 3600 * 1000
  let hi = Date.UTC(y, m - 1, d, 0, 0, 0) + 28 * 3600 * 1000
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const p = lisbonParts(new Date(mid))
    const midKey = `${p.year}-${pad(p.month)}-${pad(p.day)}`
    const midMins = p.hour * 60 + p.minute
    const targetMins = hour * 60 + minute
    if (midKey < dateKey || (midKey === dateKey && midMins < targetMins)) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return new Date(hi)
}
