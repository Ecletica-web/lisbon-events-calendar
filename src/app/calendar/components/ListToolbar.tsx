import type { ViewState } from '@/lib/viewState'

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
    if (timeRange === 'all') return 'All events'
    const focusDate = new Date(dateFocus)
    if (calendarView === 'dayGridMonth') {
      return focusDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    }
    if (calendarView === 'timeGridWeek') {
      const start = new Date(focusDate)
      const dayOfWeek = start.getDay()
      const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      start.setDate(diff)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return focusDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const goPrev = () => {
    const d = new Date(dateFocus)
    if (calendarView === 'dayGridMonth') d.setMonth(d.getMonth() - 1)
    else if (calendarView === 'timeGridWeek') d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 1)
    onDateChange(d.toISOString().split('T')[0])
  }

  const goNext = () => {
    const d = new Date(dateFocus)
    if (calendarView === 'dayGridMonth') d.setMonth(d.getMonth() + 1)
    else if (calendarView === 'timeGridWeek') d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + 1)
    onDateChange(d.toISOString().split('T')[0])
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-pager-bg border-2 border-pager-strong px-4 py-3 touch-manipulation">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex border-2 border-pager-strong">
            <button
              type="button"
              onClick={() => onShowListViewChange(false)}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                !showListView ? 'bg-pager-accent text-pager-accent-fg' : 'bg-pager-bg text-pager-fg hover:bg-pager-muted'
              }`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => onShowListViewChange(true)}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-l-2 border-pager-strong ${
                showListView ? 'bg-pager-accent text-pager-accent-fg' : 'bg-pager-bg text-pager-fg hover:bg-pager-muted'
              }`}
            >
              List
            </button>
          </div>
          <div className="flex border-2 border-pager-border gap-0">
            {(['all', 'week', 'month', 'nextMonth'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onTimeRangeChange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  timeRange === r
                    ? 'bg-pager-accent text-pager-accent-fg'
                    : 'text-pager-fg-muted hover:text-pager-fg hover:bg-pager-muted'
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
                className="p-2 text-pager-fg hover:bg-pager-muted"
                aria-label="Previous period"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goNext}
                className="p-2 text-pager-fg hover:bg-pager-muted"
                aria-label="Next period"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-pager-fg min-w-[140px] text-center">
                {getPeriodTitle()}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-pager-fg">{getPeriodTitle()}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="text-xs text-pager-fg-muted">Near me</span>
            <button
              type="button"
              onClick={handleNearMeToggle}
              className={`relative w-10 h-5 border-2 border-pager-strong transition-colors ${nearMeEnabled ? 'bg-pager-accent' : 'bg-pager-bg'}`}
              aria-label="Toggle near me filter"
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 transition-transform ${
                  nearMeEnabled
                    ? 'left-5 bg-pager-accent-fg'
                    : 'left-0.5 bg-pager-fg'
                }`}
              />
            </button>
            {nearMeEnabled && (
              <select
                value={radiusKm}
                onChange={(e) => onRadiusChange(Number(e.target.value))}
                className="text-xs pager-input py-1 min-h-[36px] w-auto"
              >
                {RADIUS_OPTIONS_KM.map((r) => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
            )}
            {locLoading && <span className="text-xs text-pager-fg-faint">Getting location...</span>}
            {locError && nearMeEnabled && <span className="text-xs text-pager-fg-muted">{locError}</span>}
          </label>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-medium text-pager-fg-muted hover:text-pager-fg underline underline-offset-2 shrink-0"
            >
              Clear all filters
            </button>
          )}
          <button
            type="button"
            onClick={() => onDateChange(new Date().toISOString().split('T')[0])}
            className="pager-btn px-3 py-1.5 text-xs uppercase tracking-wider shrink-0"
          >
            Today
          </button>
          <span className="text-xs text-pager-fg-muted shrink-0">
            {eventCount} event{eventCount !== 1 ? 's' : ''}
            {nearMeEnabled && userPos && ` within ${radiusKm} km`}
          </span>
        </div>
      </div>
    </div>
  )
}
