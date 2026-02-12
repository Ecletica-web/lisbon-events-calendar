'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { NormalizedEvent, filterEvents, toCanonicalTagKey } from '@/lib/eventsAdapter'
import type { VenueForDisplay } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'
import { useDebounce } from '@/lib/useDebounce'
import { haversineDistanceKm, formatDistance } from '@/lib/geo'

function norm(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

interface EventCardsSliderProps {
  events: NormalizedEvent[]
  onEventClick: (event: NormalizedEvent) => void
  selectedCategories?: string[]
  selectedTags?: string[]
  freeOnly?: boolean
  excludeExhibitions?: boolean
  excludeContinuous?: boolean
  onCategoriesChange?: (categories: string[]) => void
  onTagsChange?: (tags: string[]) => void
  mode?: 'slider' | 'grid'
  hideHeader?: boolean
  skipFiltering?: boolean
  dateFocus?: string
  venuesWithCoords?: VenueForDisplay[]
}

const MAX_NEARBY_KM = 25

type TimeRange = 'today' | 'tomorrow' | 'week' | 'month' | 'nextMonth'

function getDateRangeBounds(range: TimeRange, dateFocus?: string): { start: Date; end: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextDay = new Date(tomorrow)
  nextDay.setDate(nextDay.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const monthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 2, 1)

  if (range === 'today') return { start: today, end: tomorrow }
  if (range === 'tomorrow') return { start: tomorrow, end: nextDay }
  if (range === 'week') return { start: today, end: nextWeek }
  if (range === 'month') {
    if (dateFocus) {
      const d = new Date(dateFocus)
      return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) }
    }
    return { start: today, end: monthStart }
  }
  return { start: monthStart, end: nextMonthStart }
}

export default function EventCardsSlider({
  events,
  onEventClick,
  selectedCategories = [],
  selectedTags = [],
  freeOnly = false,
  excludeExhibitions = false,
  excludeContinuous = false,
  onCategoriesChange,
  onTagsChange,
  mode = 'slider',
  hideHeader = false,
  skipFiltering = false,
  dateFocus,
  venuesWithCoords = [],
}: EventCardsSliderProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('month')
  const [localCategories, setLocalCategories] = useState<string[]>(selectedCategories)
  const [localTags, setLocalTags] = useState<string[]>(selectedTags)
  const [nearMeEnabled, setNearMeEnabled] = useState(false)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locError, setLocError] = useState<string | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const debouncedCategories = useDebounce(localCategories, 200)
  const debouncedTags = useDebounce(localTags, 200)

  useEffect(() => {
    setLocalCategories(selectedCategories)
  }, [selectedCategories])

  useEffect(() => {
    setLocalTags(selectedTags)
  }, [selectedTags])

  const requestLocation = () => {
    setLocError(null)
    setLocLoading(true)
    if (!navigator.geolocation) {
      setLocError('Location not supported')
      setLocLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocLoading(false)
      },
      (err) => {
        setLocError(err.message === 'User denied Geolocation' ? 'Location denied' : 'Could not get location')
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    )
  }

  const handleNearMeToggle = () => {
    if (nearMeEnabled) {
      setNearMeEnabled(false)
      setUserPos(null)
      setLocError(null)
    } else {
      setNearMeEnabled(true)
      if (userPos) return
      requestLocation()
    }
  }

  const dateRange = useMemo(() => getDateRangeBounds(timeRange, dateFocus), [timeRange, dateFocus])

  const venueCoordsMap = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>()
    for (const v of venuesWithCoords) {
      if (typeof v.latitude === 'number' && typeof v.longitude === 'number') {
        m.set(v.venue_id, { lat: v.latitude, lng: v.longitude })
        m.set(v.slug, { lat: v.latitude, lng: v.longitude })
        m.set(norm(v.name), { lat: v.latitude, lng: v.longitude })
      }
    }
    return m
  }, [venuesWithCoords])

  const getEventCoords = (e: NormalizedEvent): { lat: number; lng: number } | null => {
    const lat = e.extendedProps?.latitude
    const lng = e.extendedProps?.longitude
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
    const vid = e.extendedProps?.venueId
    const vkey = e.extendedProps?.venueKey
    const vname = e.extendedProps?.venueName
    if (vid && venueCoordsMap.has(vid)) return venueCoordsMap.get(vid)! 
    if (vkey && venueCoordsMap.has(vkey)) return venueCoordsMap.get(vkey)!
    if (vname && venueCoordsMap.has(norm(vname))) return venueCoordsMap.get(norm(vname))!
    return null
  }

  useEffect(() => {
    const categoriesChanged = JSON.stringify(debouncedCategories.sort()) !== JSON.stringify(selectedCategories.sort())
    if (categoriesChanged && onCategoriesChange) onCategoriesChange(debouncedCategories)
  }, [debouncedCategories])

  useEffect(() => {
    const tagsChanged = JSON.stringify(debouncedTags.sort()) !== JSON.stringify(selectedTags.sort())
    if (tagsChanged && onTagsChange) onTagsChange(debouncedTags)
  }, [debouncedTags])

  const filteredEvents = useMemo(() => {
    if (skipFiltering) return events.map((e) => ({ event: e, km: undefined as number | undefined }))

    let filtered = events.filter((event) => {
      const eventDate = new Date(event.start)
      return eventDate >= dateRange.start && eventDate < dateRange.end
    })

    filtered = filterEvents(filtered, {
      selectedTags: localTags,
      categories: localCategories.length > 0 ? localCategories : undefined,
      freeOnly,
    })

    if (excludeExhibitions) {
      filtered = filtered.filter((event) => {
        const category = event.extendedProps.category?.toLowerCase()
        const tags = event.extendedProps.tags.map((t) => t.toLowerCase())
        return category !== 'arts' && !tags.some((t) => toCanonicalTagKey(t) === 'exhibition')
      })
    }

    if (excludeContinuous) {
      filtered = filtered.filter((event) => {
        if (!event.extendedProps?.opensAt || !event.end) return true
        const start = new Date(event.start)
        const end = new Date(event.end)
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        return daysDiff <= 1
      })
    }

    if (nearMeEnabled && userPos) {
      const withCoords = filtered
        .map((e) => ({ event: e, coords: getEventCoords(e) }))
        .filter((x): x is { event: NormalizedEvent; coords: { lat: number; lng: number } } => x.coords !== null)
        .map(({ event, coords }) => ({
          event,
          km: haversineDistanceKm(userPos.lat, userPos.lng, coords.lat, coords.lng),
        }))
        .filter((x) => x.km <= MAX_NEARBY_KM)
      filtered = withCoords.map((x) => x.event)
      const kmMap = new Map(withCoords.map((x) => [x.event.id, x.km]))
      filtered.sort((a, b) => (kmMap.get(a.id) ?? 999) - (kmMap.get(b.id) ?? 999))
      filtered.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      return filtered.map((e) => ({ event: e, km: kmMap.get(e.id) }))
    }

    if (timeRange === 'today') {
      filtered.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    } else {
      filtered.sort((a, b) => {
        const dateA = new Date(a.start)
        const dateB = new Date(b.start)
        const dayDiff = dateA.getDate() - dateB.getDate()
        if (dayDiff !== 0) return dayDiff
        return dateA.getTime() - dateB.getTime()
      })
    }

    return filtered.map((e) => ({ event: e, km: undefined }))
  }, [events, dateRange, localTags, localCategories, freeOnly, excludeExhibitions, excludeContinuous, timeRange, skipFiltering, nearMeEnabled, userPos, venueCoordsMap])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'slider') return
    setIsDragging(true)
    setStartX(e.pageX - (sliderRef.current?.offsetLeft || 0))
    setScrollLeft(sliderRef.current?.scrollLeft || 0)
  }
  const handleMouseLeave = () => setIsDragging(false)
  const handleMouseUp = () => setIsDragging(false)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || mode !== 'slider') return
    e.preventDefault()
    const x = e.pageX - (sliderRef.current?.offsetLeft || 0)
    const walk = (x - startX) * 2
    if (sliderRef.current) sliderRef.current.scrollLeft = scrollLeft - walk
  }
  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== 'slider') return
    setIsDragging(true)
    setStartX(e.touches[0].pageX - (sliderRef.current?.offsetLeft || 0))
    setScrollLeft(sliderRef.current?.scrollLeft || 0)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || mode !== 'slider') return
    const x = e.touches[0].pageX - (sliderRef.current?.offsetLeft || 0)
    const walk = (x - startX) * 2
    if (sliderRef.current) sliderRef.current.scrollLeft = scrollLeft - walk
  }
  const handleTouchEnd = () => setIsDragging(false)
  const scrollLeftBtn = () => sliderRef.current?.scrollBy({ left: -300, behavior: 'smooth' })
  const scrollRightBtn = () => sliderRef.current?.scrollBy({ left: 300, behavior: 'smooth' })

  const handleRemoveTag = (tag: string) => {
    onTagsChange?.(selectedTags.filter((t) => t !== tag))
  }

  const showFullHeader = !hideHeader && !skipFiltering
  const timeRangeLabel = timeRange === 'today' ? 'today' : timeRange === 'tomorrow' ? 'tomorrow' : timeRange === 'week' ? 'this week' : timeRange === 'month' ? 'this month' : 'next month'

  return (
    <div className="w-full mt-6 md:mt-8">
      {showFullHeader && (
        <div className="flex items-center justify-between mb-4 px-4 md:px-6 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-slate-800/80 rounded-lg p-1 border border-slate-700/50 flex-wrap">
              {(['today', 'tomorrow', 'week', 'month', 'nextMonth'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-md transition-all ${
                    timeRange === r ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {r === 'today' ? 'Today' : r === 'tomorrow' ? 'Tomorrow' : r === 'week' ? 'This week' : r === 'month' ? 'This month' : 'Next month'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-slate-400">Near me</span>
              <button
                onClick={() => {
                  if (!nearMeEnabled && !userPos) requestLocation()
                  setNearMeEnabled((prev) => !prev)
                }}
                className={`relative w-10 h-5 rounded-full transition-colors ${nearMeEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
                aria-label="Toggle near me filter"
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${nearMeEnabled ? 'left-5' : 'left-1'}`} />
              </button>
              {locLoading && <span className="text-xs text-slate-500">Getting location...</span>}
              {locError && nearMeEnabled && <span className="text-xs text-amber-400">{locError}</span>}
            </label>
            {selectedTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {selectedTags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-700/80 border border-slate-600/50 text-slate-200">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="hover:bg-slate-600/80 rounded-full p-0.5" aria-label={`Remove ${tag}`}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="text-sm text-slate-400">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} match
            {nearMeEnabled && userPos && ` within ${MAX_NEARBY_KM} km`}
          </span>
        </div>
      )}

      {filteredEvents.length > 0 ? (
        <div className="relative overflow-hidden">
          {mode === 'slider' && (
            <>
              <button onClick={scrollLeftBtn} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/90 transition-all shadow-lg hidden md:block" aria-label="Scroll left">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={scrollRightBtn} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/90 transition-all shadow-lg hidden md:block" aria-label="Scroll right">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </>
          )}
          <div
            ref={sliderRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`${mode === 'slider' ? 'flex gap-4 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth px-4 md:px-6 pb-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6'} ${isDragging ? 'cursor-grabbing' : mode === 'slider' ? 'cursor-grab' : ''}`}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {filteredEvents.map(({ event, km }) => (
              <EventCard key={event.id} event={event} onClick={() => onEventClick(event)} mode={mode} distanceKm={km} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 px-4 md:px-6">
          <div className="text-slate-300 text-base font-medium mb-2">
            No events found for {timeRangeLabel}
            {nearMeEnabled && userPos && ' near you'}
          </div>
          <div className="text-slate-400 text-sm">Try broadening your search or adjusting your filters</div>
          {nearMeEnabled && userPos && (
            <button onClick={() => setNearMeEnabled(false)} className="mt-2 text-xs text-indigo-400 hover:underline">
              Turn off Near me
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EventCard({ event, onClick, mode, distanceKm }: { event: NormalizedEvent; onClick: () => void; mode: 'slider' | 'grid'; distanceKm?: number }) {
  const props = event.extendedProps
  const categoryColor = getCategoryColor(props.category)
  const startDate = new Date(event.start)

  const formatDate = () => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const eventDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const tomorrowDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())
    if (eventDay.getTime() === todayDay.getTime()) return 'Today'
    if (eventDay.getTime() === tomorrowDay.getTime()) return 'Tomorrow'
    return startDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const formatTime = () => {
    if (props.opensAt) return `Opens ${props.opensAt}`
    return startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const formatPrice = () => {
    if (props.isFree) return 'Free'
    if (props.priceMin !== undefined && props.priceMax !== undefined) {
      if (props.priceMin === props.priceMax) return `${props.priceMin} ${props.currency === 'EUR' ? '€' : props.currency || '€'}`
      return `${props.priceMin}–${props.priceMax} ${props.currency === 'EUR' ? '€' : props.currency || '€'}`
    }
    if (props.priceMin !== undefined) return `From ${props.priceMin} ${props.currency === 'EUR' ? '€' : props.currency || '€'}`
    return null
  }

  const displayTags = props.tags.slice(0, 2)

  return (
    <div
      onClick={onClick}
      className={`bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02] ${mode === 'slider' ? 'min-w-[280px] md:min-w-[320px] flex-shrink-0' : ''}`}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-24 h-24 md:w-20 md:h-20">
          <img src={props.imageUrl || '/lisboa.png'} alt={event.title} className="w-full h-full object-cover rounded-lg border border-slate-700/50" onError={(e) => { e.currentTarget.src = '/lisboa.png' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-base font-semibold text-white line-clamp-2 min-h-[2.5rem]">{event.title}</h3>
            {formatPrice() && <span className={`flex-shrink-0 text-xs font-medium tabular-nums ${props.isFree ? 'text-green-400' : 'text-slate-300'}`}>{formatPrice()}</span>}
          </div>
          <div className="text-xs font-medium text-slate-300 tabular-nums mb-1">
            {formatDate()} · {formatTime()}
          </div>
          {distanceKm !== undefined && (
            <div className="flex items-center gap-2 text-xs text-indigo-400 mb-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {formatDistance(distanceKm)} away
            </div>
          )}
          {props.venueName && <div className="text-sm text-slate-300 line-clamp-1 mb-2">{props.venueName}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            {props.category && <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: categoryColor }}>{props.category}</span>}
            {displayTags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-200 border border-slate-600/50">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
