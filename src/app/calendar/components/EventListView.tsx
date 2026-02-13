'use client'

import Link from 'next/link'
import { getCategoryColor } from '@/lib/categoryColors'
import { haversineDistanceKm, formatDistance } from '@/lib/geo'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import type { ViewState } from '@/lib/viewState'
import FollowButton from '@/components/FollowButton'

interface EventListViewProps {
  events: NormalizedEvent[]
  calendarView: ViewState['viewMode']
  dateFocus: string
  onEventClick: (info: { event: { id: string } }) => void
  onDateChange?: (newDateFocus: string) => void
  /** When true, parent renders the date nav (e.g. in combined toolbar); this component only renders events */
  hideDateNav?: boolean
  /** When true, show all events without date filtering (e.g. for "All" range) */
  skipDateFilter?: boolean
  /** When near me is on, show distance per event */
  userPos?: { lat: number; lng: number } | null
  venueCoordsMap?: Map<string, { lat: number; lng: number }>
}

export default function EventListView({
  events,
  calendarView,
  dateFocus,
  onEventClick,
  onDateChange,
  hideDateNav = false,
  skipDateFilter = false,
  userPos = null,
  venueCoordsMap,
}: EventListViewProps) {
  const getEventDistanceKm = (e: NormalizedEvent): number | null => {
    if (!userPos || !venueCoordsMap) return null
    const norm = (s: string) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
    const lat = e.extendedProps?.latitude
    const lng = e.extendedProps?.longitude
    if (typeof lat === 'number' && typeof lng === 'number') {
      return haversineDistanceKm(userPos.lat, userPos.lng, lat, lng)
    }
    const vid = e.extendedProps?.venueId
    const vkey = e.extendedProps?.venueKey
    const vname = e.extendedProps?.venueName
    let coords: { lat: number; lng: number } | undefined
    if (vid) coords = venueCoordsMap.get(vid)
    if (!coords && vkey) coords = venueCoordsMap.get(vkey)
    if (!coords && vname) coords = venueCoordsMap.get(norm(vname))
    if (!coords) return null
    return haversineDistanceKm(userPos.lat, userPos.lng, coords.lat, coords.lng)
  }
  const getDateRange = () => {
    const focusDate = new Date(dateFocus)
    const year = focusDate.getFullYear()
    const month = focusDate.getMonth()
    const day = focusDate.getDate()

    if (calendarView === 'dayGridMonth') {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59)
      return { start, end }
    } else if (calendarView === 'timeGridWeek') {
      const start = new Date(focusDate)
      const dayOfWeek = start.getDay()
      const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      start.setDate(diff)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return { start, end }
    } else {
      const start = new Date(year, month, day, 0, 0, 0)
      const end = new Date(year, month, day, 23, 59, 59)
      return { start, end }
    }
  }

  const { start, end } = getDateRange()
  const filteredEvents = skipDateFilter
    ? [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    : events
        .filter((event) => {
          const eventDate = new Date(event.start)
          return eventDate >= start && eventDate <= end
        })
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const eventsByDay = new Map<string, NormalizedEvent[]>()
  filteredEvents.forEach((event) => {
    const eventDate = new Date(event.start)
    const dayKey = eventDate.toISOString().split('T')[0]
    if (!eventsByDay.has(dayKey)) eventsByDay.set(dayKey, [])
    eventsByDay.get(dayKey)!.push(event)
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const tomorrowDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())
    if (dateDay.getTime() === todayDay.getTime()) return 'Today'
    if (dateDay.getTime() === tomorrowDay.getTime()) return 'Tomorrow'
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatTime = (event: NormalizedEvent) => {
    const opensAt = event.extendedProps?.opensAt
    if (opensAt) return `Opens ${opensAt}`
    const start = new Date(event.start)
    const endDt = event.end ? new Date(event.end) : null
    const startTime = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (endDt) {
      const endTime = endDt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      return `${startTime} – ${endTime}`
    }
    return startTime
  }

  const getPeriodTitle = () => {
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
    if (!onDateChange) return
    const d = new Date(dateFocus)
    if (calendarView === 'dayGridMonth') {
      d.setMonth(d.getMonth() - 1)
    } else if (calendarView === 'timeGridWeek') {
      d.setDate(d.getDate() - 7)
    } else {
      d.setDate(d.getDate() - 1)
    }
    onDateChange(d.toISOString().split('T')[0])
  }

  const goNext = () => {
    if (!onDateChange) return
    const d = new Date(dateFocus)
    if (calendarView === 'dayGridMonth') {
      d.setMonth(d.getMonth() + 1)
    } else if (calendarView === 'timeGridWeek') {
      d.setDate(d.getDate() + 7)
    } else {
      d.setDate(d.getDate() + 1)
    }
    onDateChange(d.toISOString().split('T')[0])
  }

  const goToday = () => {
    if (!onDateChange) return
    onDateChange(new Date().toISOString().split('T')[0])
  }

  if (filteredEvents.length === 0) {
    return (
      <div className="space-y-6">
        {onDateChange && !hideDateNav && (
          <div className="flex items-center justify-between gap-4 flex-wrap bg-slate-800/60 rounded-xl border border-slate-700/50 px-4 py-3">
            <div className="flex items-center gap-2">
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
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors"
            >
              Today
            </button>
          </div>
        )}
        <div className="flex items-center justify-center h-96">
          <div className="text-slate-400">No events in this period</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {onDateChange && !hideDateNav && (
        <div className="flex items-center justify-between gap-4 flex-wrap bg-slate-800/60 rounded-xl border border-slate-700/50 px-4 py-3">
          <div className="flex items-center gap-2">
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
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors"
          >
            Today
          </button>
        </div>
      )}
      {Array.from(eventsByDay.entries()).map(([dayKey, dayEvents]) => (
        <div
          key={dayKey}
          className="bg-slate-800/60 backdrop-blur-xl rounded-xl border border-slate-700/50 overflow-hidden"
        >
          <div className="bg-slate-900/80 px-4 py-3 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">{formatDate(dayKey)}</div>
              <div className="text-xs text-slate-400">
                {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-700/50">
            {dayEvents.map((event) => {
              const categoryColor = getCategoryColor(event.extendedProps.category)
              const distanceKm = getEventDistanceKm(event)
              const priceStr = event.extendedProps.isFree
                ? 'Free'
                : event.extendedProps.priceMin != null
                  ? `${event.extendedProps.priceMin}${event.extendedProps.priceMax && event.extendedProps.priceMax !== event.extendedProps.priceMin ? `–${event.extendedProps.priceMax}` : ''} ${event.extendedProps.currency === 'EUR' ? '€' : event.extendedProps.currency || '€'}`
                  : null
              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick({ event })}
                  className="px-4 py-4 min-h-[44px] hover:bg-slate-700/30 transition-colors cursor-pointer touch-manipulation"
                >
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="flex-shrink-0 w-24 h-24 md:w-20 md:h-20 rounded-lg overflow-hidden bg-slate-700/50">
                      <img
                        src={event.extendedProps.imageUrl || '/lisboa.png'}
                        alt={event.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/lisboa.png'
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <h3 className="text-base font-semibold text-white leading-tight">
                          {event.title}
                        </h3>
                        {priceStr && (
                          <span
                            className={`flex-shrink-0 text-xs font-medium tabular-nums ${event.extendedProps.isFree ? 'text-green-400' : 'text-slate-300'}`}
                          >
                            {priceStr}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-300 tabular-nums mb-1">
                        {formatTime(event)}
                      </div>
                      {distanceKm != null && (
                        <div className="flex items-center gap-2 text-xs text-indigo-400 mb-1">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {formatDistance(distanceKm)} away
                        </div>
                      )}
                      {event.extendedProps.venueName && (
                        <div className="flex items-center gap-2 flex-wrap mb-2" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/venues/${encodeURIComponent(event.extendedProps.venueId || event.extendedProps.venueKey || event.extendedProps.venueName?.toLowerCase().replace(/\s+/g, '-') || '')}`}
                            className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                          >
                            {event.extendedProps.venueName}
                          </Link>
                          <FollowButton
                            type="venue"
                            normalizedValue={(event.extendedProps.venueId || event.extendedProps.venueKey || event.extendedProps.venueName || '').toLowerCase().trim()}
                            displayValue={event.extendedProps.venueName}
                            size="sm"
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {event.extendedProps.category && (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium text-white"
                            style={{ backgroundColor: categoryColor }}
                          >
                            {event.extendedProps.category}
                          </span>
                        )}
                        {event.extendedProps.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-200 border border-slate-600/50"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
