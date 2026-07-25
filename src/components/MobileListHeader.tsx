'use client'

const RADIUS_OPTIONS_KM = [2, 5, 10, 15, 25, 50] as const

export type MobileListTimeRange = 'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'nextMonth'

interface MobileListHeaderProps {
  timeRange: MobileListTimeRange
  onTimeRangeChange: (range: MobileListTimeRange) => void
  nearMeEnabled: boolean
  onNearMeChange: (enabled: boolean) => void
  radiusKm: number
  onRadiusChange: (km: number) => void
  onLocationRequest: () => void
  userPos: { lat: number; lng: number } | null
  locLoading: boolean
  locError: string | null
  eventCount: number
  /** Optional filter button (e.g. funnel icon) to show on the left of Near me row */
  filterButton?: React.ReactNode
  /** Called when user clicks Clear all filters */
  onClearFilters?: () => void
}

export default function MobileListHeader({
  timeRange,
  onTimeRangeChange,
  nearMeEnabled,
  onNearMeChange,
  radiusKm,
  onRadiusChange,
  onLocationRequest,
  userPos,
  locLoading,
  locError,
  eventCount,
  filterButton,
  onClearFilters,
}: MobileListHeaderProps) {
  const handleNearMeToggle = () => {
    if (nearMeEnabled) {
      onNearMeChange(false)
    } else {
      onNearMeChange(true)
      if (!userPos) onLocationRequest()
    }
  }

  const timeRangeLabels: Record<MobileListTimeRange, string> = {
    all: 'All',
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'Week',
    month: 'Month',
    nextMonth: 'Next',
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex border-2 border-pager-strong overflow-x-auto scrollbar-hide">
        {(['all', 'today', 'tomorrow', 'week', 'month', 'nextMonth'] as const).map((r) => (
          <button
            key={r}
            onClick={() => onTimeRangeChange(r)}
            className={`flex-shrink-0 py-2.5 min-h-[44px] px-3 text-xs font-medium whitespace-nowrap touch-manipulation ${
              timeRange === r
                ? 'bg-pager-accent text-pager-accent-fg'
                : 'text-pager-fg-muted hover:text-pager-fg hover:bg-pager-muted'
            }`}
          >
            {timeRangeLabels[r]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          {filterButton}
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
              onClick={(e) => e.stopPropagation()}
            >
              {RADIUS_OPTIONS_KM.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          )}
          {locLoading && <span className="text-xs text-pager-fg-faint">Getting location...</span>}
          {locError && nearMeEnabled && <span className="text-xs text-pager-fg-muted">{locError}</span>}
        </label>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onClearFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs font-medium text-pager-fg-muted hover:text-pager-fg transition-colors underline underline-offset-2 touch-manipulation"
            >
              Clear all filters
            </button>
          )}
          <span className="text-xs text-pager-fg-muted">
            {eventCount} event{eventCount !== 1 ? 's' : ''}
            {nearMeEnabled && userPos && ` within ${radiusKm} km`}
          </span>
        </div>
      </div>
    </div>
  )
}
