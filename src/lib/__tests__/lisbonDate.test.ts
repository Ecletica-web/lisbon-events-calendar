import { describe, expect, it } from 'vitest'
import {
  addDaysKey,
  addMonthsKey,
  getLisbonRangeBounds,
  lisbonDateKey,
  lisbonTodayKey,
  lisbonWeekRange,
  parseDateKeyLocal,
  startOfNextMonthKey,
} from '@/lib/lisbonDate'

describe('lisbonDate', () => {
  it('formats Lisbon calendar day without UTC day-shift (summer WEST)', () => {
    // 27 Jul 2026 00:30 UTC = 01:30 Lisbon — still 27 Jul in Lisbon
    const d = new Date('2026-07-27T00:30:00.000Z')
    expect(lisbonDateKey(d)).toBe('2026-07-27')
  })

  it('local midnight Date must not be written via toISOString for Lisbon today', () => {
    // Simulate what the bug did: local midnight Jul 27 → toISOString → Jul 26 in UTC+1
    const localMidnight = new Date(2026, 6, 27, 0, 0, 0, 0)
    const buggy = localMidnight.toISOString().split('T')[0]
    // In environments with offset east of UTC this is yesterday; helper must stay on 27
    expect(lisbonDateKey(localMidnight)).toBe('2026-07-27')
    // Document the antipattern when offset is +1 or more
    const offsetHours = -localMidnight.getTimezoneOffset() / 60
    if (offsetHours > 0) {
      expect(buggy).not.toBe('2026-07-27')
    }
  })

  it('parseDateKeyLocal does not shift via UTC', () => {
    const d = parseDateKeyLocal('2026-07-27')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(27)
    expect(d.getHours()).toBe(0)
  })

  it('addDaysKey and month helpers', () => {
    expect(addDaysKey('2026-07-27', 1)).toBe('2026-07-28')
    expect(startOfNextMonthKey('2026-07-27')).toBe('2026-08-01')
    expect(addMonthsKey('2026-07-15', 1)).toBe('2026-08-15')
  })

  it('today / tomorrow / nextMonth presets use Lisbon keys', () => {
    const now = new Date('2026-07-27T15:00:00.000Z') // afternoon UTC → still 27 in Lisbon
    const todayKey = lisbonTodayKey(now)
    expect(todayKey).toBe('2026-07-27')

    const today = getLisbonRangeBounds('today', now)!
    expect(lisbonDateKey(today.start)).toBe('2026-07-27')

    const tomorrow = getLisbonRangeBounds('tomorrow', now)!
    expect(lisbonDateKey(tomorrow.start)).toBe('2026-07-28')

    const nextMonth = getLisbonRangeBounds('nextMonth', now)!
    expect(lisbonDateKey(nextMonth.start)).toBe('2026-08-01')
  })

  it('week range starts Sunday 19:00 Lisbon', () => {
    // Monday 27 Jul 2026 afternoon Lisbon
    const now = new Date('2026-07-27T14:00:00.000Z')
    const { start, end } = lisbonWeekRange(now)
    // Previous Sunday was 26 Jul 2026 19:00 Lisbon
    expect(lisbonDateKey(start)).toBe('2026-07-26')
    const startParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(start)
    const hour = startParts.find((p) => p.type === 'hour')?.value
    const weekday = startParts.find((p) => p.type === 'weekday')?.value
    expect(hour).toBe('19')
    expect(weekday?.toLowerCase().startsWith('sun')).toBe(true)
    expect(end.getTime() - start.getTime()).toBeGreaterThan(6 * 24 * 3600 * 1000)
  })
})
