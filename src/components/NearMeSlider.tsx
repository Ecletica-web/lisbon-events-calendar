'use client'

import { useState, useRef, useMemo } from 'react'
import { NormalizedEvent } from '@/lib/eventsAdapter'
import type { VenueForDisplay } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'
import { haversineDistanceKm, formatDistance } from '@/lib/geo'

function norm(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

interface NearMeSliderProps {
  events: NormalizedEvent[]
  venuesWithCoords?: VenueForDisplay[]
  onEventClick: (event: NormalizedEvent) => void
}

const MAX_NEARBY_KM = 25

type DateRange = 'today' | 'tomorrow' | 'week'

function getDateRangeBounds(range: DateRange): { start: Date; end: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextDay = new Date(tomorrow)
  nextDay.setDate(nextDay.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)

  if (range === 'today') {
    return { start: today, end: tomorrow }
  }
  if (range === 'tomorrow') {
    return { start: tomorrow, end: nextDay }
  }
  // week: next 7 days
  return { start: today, end: nextWeek }
}

export default function NearMeSlider({ events, venuesWithCoords = [], onEventClick }: NearMeSliderProps) {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locError, setLocError] = useState<string | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('week')
  const sliderRef = useRef<HTMLDivElement>(null)

  const requestLocation = () => {
    setLocError(null)
    setLocLoading(true)
    if (!navigator.geolocation) {
      setLocError('Location is not supported by your browser')
      setLocLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocLoading(false)
      },
      (err) => {
        setLocError(err.message === 'User denied Geolocation' ? 'Location access denied' : 'Could not get location')
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    )
  }

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
    if (vid) {
      const c = venueCoordsMap.get(vid)
      if (c) return c
    }
    if (vkey) {
      const c = venueCoordsMap.get(vkey)
      if (c) return c
    }
    if (vname) {
      const c = venueCoordsMap.get(norm(vname))
      if (c) return c
    }
    return null
  }

  const dateBounds = useMemo(() => getDateRangeBounds(dateRange), [dateRange])

  const nearbyEvents = useMemo(() => {
    if (!userPos) return []
    const { start, end } = dateBounds

    const withCoords = events
      .map((e) => ({ event: e, coords: getEventCoords(e) }))
      .filter((x): x is { event: NormalizedEvent; coords: { lat: number; lng: number } } => x.coords !== null)

    const withDistance = withCoords
      .map(({ event, coords }) => {
        const km = haversineDistanceKm(userPos.lat, userPos.lng, coords.lat, coords.lng)
        return { event, km }
      })
      .filter((x) => x.km <= MAX_NEARBY_KM)
      .filter((x) => {
        const start = new Date(x.event.start)
        return start >= dateBounds.start && start < dateBounds.end
      })
      .sort((a, b) => a.km - b.km)
      .sort((a, b) => new Date(a.event.start).getTime() - new Date(b.event.start).getTime())

    return withDistance
  }, [events, userPos, venueCoordsMap, dateBounds])

  const scrollLeft = () => {
    sliderRef.current?.scrollBy({ left: -300, behavior: 'smooth' })
  }

  const scrollRight = () => {
    sliderRef.current?.scrollBy({ left: 300, behavior: 'smooth' })
  }

  if (!userPos) {
    return (
      <div className="w-full mt-6 md:mt-8">
        <div className="flex items-center justify-between mb-4 px-4 md:px-6 flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-slate-200">Near me</h3>
        </div>
        <div className="px-4 md:px-6 py-6 rounded-xl border border-slate-700/50 bg-slate-800/40">
          <p className="text-slate-400 text-sm mb-4">
            Enable location to see events near you
          </p>
          <button
            onClick={requestLocation}
            disabled={locLoading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-60 transition-all"
          >
            {locLoading ? 'Getting location...' : 'Enable location'}
          </button>
          {locError && (
            <p className="mt-3 text-sm text-amber-400">{locError}</p>
          )}
        </div>
      </div>
    )
  }

  const dateRangeLabel = dateRange === 'today' ? 'today' : dateRange === 'tomorrow' ? 'tomorrow' : 'this week'

  return (
    <div className="w-full mt-6 md:mt-8">
      <div className="flex items-center justify-between mb-4 px-4 md:px-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-200">Near me</h3>
          <div className="flex bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
            <button
              onClick={() => setDateRange('today')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dateRange === 'today' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' : 'text-slate-300 hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange('tomorrow')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dateRange === 'tomorrow' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' : 'text-slate-300 hover:text-white'
              }`}
            >
              Tomorrow
            </button>
            <button
              onClick={() => setDateRange('week')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dateRange === 'week' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' : 'text-slate-300 hover:text-white'
              }`}
            >
              This week
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {nearbyEvents.length} event{nearbyEvents.length !== 1 ? 's' : ''} within {MAX_NEARBY_KM} km
          </span>
          <button
            onClick={() => setUserPos(null)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Disable location
          </button>
        </div>
      </div>

      {nearbyEvents.length === 0 ? (
        <div className="px-4 md:px-6 py-6 rounded-xl border border-slate-700/50 bg-slate-800/40">
          <p className="text-slate-400 text-sm">No nearby events for {dateRangeLabel}</p>
        </div>
      ) : (
        <div className="relative overflow-hidden">
          <button
            onClick={scrollLeft}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/90 transition-all shadow-lg hidden md:block"
            aria-label="Scroll left"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={scrollRight}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/90 transition-all shadow-lg hidden md:block"
            aria-label="Scroll right"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div
            ref={sliderRef}
            className="flex gap-4 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth px-4 md:px-6 pb-4"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {nearbyEvents.map(({ event, km }) => (
              <NearMeEventCard
                key={event.id}
                event={event}
                distanceKm={km}
                onClick={() => onEventClick(event)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NearMeEventCard({
  event,
  distanceKm,
  onClick,
}: {
  event: NormalizedEvent
  distanceKm: number
  onClick: () => void
}) {
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
      if (props.priceMin === props.priceMax) {
        return `${props.priceMin} ${props.currency === 'EUR' ? '€' : props.currency || '€'}`
      }
      return `${props.priceMin}–${props.priceMax} ${props.currency === 'EUR' ? '€' : props.currency || '€'}`
    }
    if (props.priceMin !== undefined) {
      return `From ${props.priceMin} ${props.currency === 'EUR' ? '€' : props.currency || '€'}`
    }
    return null
  }

  const displayTags = props.tags.slice(0, 2)

  return (
    <div
      onClick={onClick}
      className="min-w-[280px] md:min-w-[320px] flex-shrink-0 bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02]"
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-24 h-24 md:w-20 md:h-20">
          <img
            src={props.imageUrl || '/lisboa.png'}
            alt={event.title}
            className="w-full h-full object-cover rounded-lg border border-slate-700/50"
            onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-base font-semibold text-white line-clamp-2 min-h-[2.5rem]">
              {event.title}
            </h3>
            {formatPrice() && (
              <span className={`flex-shrink-0 text-xs font-medium tabular-nums ${props.isFree ? 'text-green-400' : 'text-slate-300'}`}>
                {formatPrice()}
              </span>
            )}
          </div>
          <div className="text-xs font-medium text-slate-300 tabular-nums mb-1">
            {formatDate()} · {formatTime()}
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-400 mb-2">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {formatDistance(distanceKm)} away
          </div>
          {props.venueName && (
            <div className="text-sm text-slate-400 line-clamp-1 mb-2">{props.venueName}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {props.category && (
              <span
                className="px-2 py-0.5 rounded text-xs font-medium text-white"
                style={{ backgroundColor: categoryColor }}
              >
                {props.category}
              </span>
            )}
            {displayTags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-200 border border-slate-600/50">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
