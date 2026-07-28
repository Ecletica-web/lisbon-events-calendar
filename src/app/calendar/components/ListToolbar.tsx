import type { ViewState } from '@/lib/viewState'
import {
  addDaysKey,
  addMonthsKey,
  lisbonTodayKey,
  lisbonWeekBoundsFromKey,
  parseDateKeyLocal,
} from '@/lib/lisbonDate'

const RADIUS_OPTIONS_KM = [2, 5, 10, 15, 25, 50] as const

export interface ListToolbarProps {
  calendarView: ViewState['viewMode']
  dateFocus: string
  onDateChange: (d: string) => void
  showListView: boolean
  onShowListViewChange: (v: boolean) => void
  timeRange: 'all' | 'week' | 'month' | 'nextMonth'
  onTimeRangeChange: (r: 'all' | 'week' | 'month' | 'nextMonth') => void
  skipDateFilter: boolean
  nearMeEnabled: boolean
  onNearMeChange: (v: boolean) => void
  radiusKm: number
  onRadiusChange: (km: number) => void
  onLocationRequest: () => void
  userPos: { lat: number; lng: number } | null
  locLoading: boolean
  locError: string | null
  eventCount: number
  onClearFilters?: () => void
}

export function ListToolbar({
  calendarView,
  dateFocus,
  onDateChange,
  showListView,
  onShowListViewChange,
  timeRange,
  onTimeRangeChange,
  skipDateFilter,
  nearMeEnabled,
  onNearMeChange,
  radiusKm,
  onRadiusChange,
  onLocationRequest,
  userPos,
  locLoading,
  locError,
  eventCount,
  onClearFilters,
}: ListToolbarProps) {
  const handleNearMeToggle = () => {
    if (nearMeEnabled) {
      onNearMeChange(false)
    } else {
      onNearMeChange(true)
      if (!userPos) onLocationRequest()
    }
  }

  const getPeriodTitle = () => {
    if (timeRange === 'all') return 'All upcoming'
    const focusDate = parseDateKeyLocal(dateFocus)
    if (calendarView === 'dayGridMonth') {
      return focusDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    }
    if (calendarView === 'timeGridWeek') {
      const { start, end } = lisbonWeekBoundsFromKey(dateFocus)
      return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' })}`
    }
    return focusDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const goPrev = () => {
    if (calendarView === 'dayGridMonth') onDateChange(addMonthsKey(dateFocus, -1))
    else if (calendarView === 'timeGridWeek') onDateChange(addDaysKey(dateFocus, -7))
    else onDateChange(addDaysKey(dateFocus, -1))
  }

  const goNext = () => {
    if (calendarView === 'dayGridMonth') onDateChange(addMonthsKey(dateFocus, 1))
    else if (calendarView === 'timeGridWeek') onDateChange(addDaysKey(dateFocus, 7))
    else onDateChange(addDaysKey(dateFocus, 1))
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-terminus-bg border-2 border-terminus-strong px-4 py-3 touch-manipulation">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex border-2 border-terminus-strong">
            <button
              type="button"
              onClick={() => onShowListViewChange(false)}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                !showListView ? 'bg-terminus-accent text-terminus-accent-fg' : 'bg-terminus-bg text-terminus-fg hover:bg-terminus-muted'
              }`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => onShowListViewChange(true)}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-l-2 border-terminus-strong ${
                showListView ? 'bg-terminus-accent text-terminus-accent-fg' : 'bg-terminus-bg text-terminus-fg hover:bg-terminus-muted'
              }`}
            >
              List
            </button>
          </div>
          <div className="flex border-2 border-terminus-border gap-0">
            {(['all', 'week', 'month', 'nextMonth'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onTimeRangeChange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  timeRange === r
                    ? 'bg-terminus-accent text-terminus-accent-fg'
                    : 'text-terminus-fg-muted hover:text-terminus-fg hover:bg-terminus-muted'
                }`}
              >
                {r === 'all' ? 'All' : r === 'week' ? 'This week' : r === 'month' ? 'This month' : 'Next month'}
              </button>
            ))}
          </div>
          {!skipDateFilter ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                className="p-2 text-terminus-fg hover:bg-terminus-muted"
                aria-label="Previous period"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goNext}
                className="p-2 text-terminus-fg hover:bg-terminus-muted"
                aria-label="Next period"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-terminus-fg min-w-[140px] text-center">
                {getPeriodTitle()}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-terminus-fg">{getPeriodTitle()}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="text-xs text-terminus-fg-muted">Near me</span>
            <button
              type="button"
              onClick={handleNearMeToggle}
              className={`relative w-10 h-5 border-2 border-terminus-strong transition-colors ${nearMeEnabled ? 'bg-terminus-accent' : 'bg-terminus-bg'}`}
              aria-label="Toggle near me filter"
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 transition-transform ${
                  nearMeEnabled
                    ? 'left-5 bg-terminus-accent-fg'
                    : 'left-0.5 bg-terminus-fg'
                }`}
              />
            </button>
            {nearMeEnabled && (
              <select
                value={radiusKm}
                onChange={(e) => onRadiusChange(Number(e.target.value))}
                className="text-xs terminus-input py-1 min-h-[36px] w-auto"
              >
                {RADIUS_OPTIONS_KM.map((r) => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
            )}
            {locLoading && <span className="text-xs text-terminus-fg-faint">Getting location...</span>}
            {locError && nearMeEnabled && <span className="text-xs text-terminus-fg-muted">{locError}</span>}
          </label>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-medium text-terminus-fg-muted hover:text-terminus-fg underline underline-offset-2 shrink-0"
            >
              Clear all filters
            </button>
          )}
          <button
            type="button"
            onClick={() => onDateChange(lisbonTodayKey())}
            className="terminus-btn px-3 py-1.5 text-xs uppercase tracking-wider shrink-0"
          >
            Today
          </button>
          <span className="text-xs text-terminus-fg-muted shrink-0">
            {eventCount} event{eventCount !== 1 ? 's' : ''}
            {nearMeEnabled && userPos && ` within ${radiusKm} km`}
          </span>
        </div>
      </div>
    </div>
  )
}
