'use client'

const RADIUS_OPTIONS_KM = [2, 5, 10, 15, 25, 50] as const
const DEFAULT_RADIUS_KM = 2

export type MobileListTimeRange = 'today' | 'tomorrow' | 'week' | 'month'

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
}: MobileListHeaderProps) {
  const handleNearMeToggle = () => {
    if (nearMeEnabled) {
      onNearMeChange(false)
    } else {
      onNearMeChange(true)
      if (!userPos) onLocationRequest()
    }
  }

  return (
    <div className="space-y-3 mb-4">
      {/* Time range tabs */}
      <div className="flex bg-slate-800/80 rounded-lg p-1 border border-slate-700/50 overflow-x-auto scrollbar-hide">
        {(['today', 'tomorrow', 'week', 'month'] as const).map((r) => (
          <button
            key={r}
            onClick={() => onTimeRangeChange(r)}
            className={`flex-1 min-w-0 py-2.5 min-h-[44px] px-2 rounded-md text-xs font-medium transition-all whitespace-nowrap touch-manipulation ${
              timeRange === r ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' : 'text-slate-300 hover:text-white'
            }`}
          >
            {r === 'today' ? 'Today' : r === 'tomorrow' ? 'Tomorrow' : r === 'week' ? 'This week' : 'This month'}
          </button>
        ))}
      </div>

      {/* Near me + radius */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
              className="text-xs bg-slate-800 border border-slate-600/50 rounded-md px-2 py-2 min-h-[36px] text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 touch-manipulation"
              onClick={(e) => e.stopPropagation()}
            >
              {RADIUS_OPTIONS_KM.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          )}
          {locLoading && <span className="text-xs text-slate-500">Getting location...</span>}
          {locError && nearMeEnabled && <span className="text-xs text-amber-400">{locError}</span>}
        </label>
        <span className="text-xs text-slate-400 shrink-0">
          {eventCount} event{eventCount !== 1 ? 's' : ''}
          {nearMeEnabled && userPos && ` within ${radiusKm} km`}
        </span>
      </div>
    </div>
  )
}
