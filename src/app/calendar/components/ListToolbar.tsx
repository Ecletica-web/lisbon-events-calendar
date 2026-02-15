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
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/60 rounded-xl border border-slate-700/50 px-4 py-3 touch-manipulation">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0 bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
            <button
              onClick={() => onShowListViewChange(false)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white transition-all"
            >
              Calendar
            </button>
            <button
              onClick={() => onShowListViewChange(true)}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
            >
              List
            </button>
          </div>
          <div className="flex bg-slate-800/80 rounded-lg p-1 border border-slate-700/50 gap-0">
            {(['all', 'week', 'month', 'nextMonth'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onTimeRangeChange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  timeRange === r ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' : 'text-slate-300 hover:text-white'
                }`}
              >
                {r === 'all' ? 'All' : r === 'week' ? 'This week' : r === 'month' ? 'This month' : 'Next month'}
              </button>
            ))}
          </div>
          {!skipDateFilter ? (
            <div className="flex items-center gap-1">
              <button
                onClick={goPrev}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
                aria-label="Previous period"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goNext}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
                aria-label="Next period"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-slate-200 min-w-[140px] text-center">
                {getPeriodTitle()}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-slate-200">{getPeriodTitle()}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="text-xs text-slate-400">Near me</span>
            <button
              type="button"
              onClick={handleNearMeToggle}
              className={`relative w-10 h-5 rounded-full transition-colors ${nearMeEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
              aria-label="Toggle near me filter"
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${nearMeEnabled ? 'left-5' : 'left-1'}`} />
            </button>
            {nearMeEnabled && (
              <select
                value={radiusKm}
                onChange={(e) => onRadiusChange(Number(e.target.value))}
                className="text-xs bg-slate-800 border border-slate-600/50 rounded-md px-2 py-2 min-h-[36px] text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {RADIUS_OPTIONS_KM.map((r) => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
            )}
            {locLoading && <span className="text-xs text-slate-500">Getting location...</span>}
            {locError && nearMeEnabled && <span className="text-xs text-amber-400">{locError}</span>}
          </label>
          {onClearFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs font-medium text-slate-400 hover:text-white transition-colors underline underline-offset-2 shrink-0"
            >
              Clear all filters
            </button>
          )}
          <button
            onClick={() => onDateChange(new Date().toISOString().split('T')[0])}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors shrink-0"
          >
            Today
          </button>
          <span className="text-xs text-slate-400 shrink-0">
            {eventCount} event{eventCount !== 1 ? 's' : ''}
            {nearMeEnabled && userPos && ` within ${radiusKm} km`}
          </span>
        </div>
      </div>
    </div>
  )
}
