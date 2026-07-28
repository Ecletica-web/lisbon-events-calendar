'use client'

import Link from 'next/link'
import { haversineDistanceKm, formatDistance } from '@/lib/geo'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import type { ViewState } from '@/lib/viewState'
import FollowButton from '@/components/FollowButton'
import { EventImageThumb } from '@/components/EventImageGallery'
import {
  addDaysKey,
  addMonthsKey,
  lisbonDateKey,
  lisbonMonthBoundsFromKey,
  lisbonTodayKey,
  lisbonWeekBoundsFromKey,
  parseDateKeyLocal,
  lisbonDayBoundsFromKey,
  lisbonStartOfToday,
} from '@/lib/lisbonDate'
import { venueHrefFromEvent } from '@/lib/venuePath'

interface EventListViewProps {
  events: NormalizedEvent[]
  calendarView: ViewState['viewMode']
  dateFocus: string
  onEventClick: (info: { event: { id: string } }) => void
  onDateChange?: (newDateFocus: string) => void
  /** When true, parent renders the date nav (e.g. in combined toolbar); this component only renders events */
  hideDateNav?: boolean
  /**
   * When true, skip calendar-period filter but still hide past events
   * (upcoming-from-today). Used for the "All" range.
   */
  skipDateFilter?: boolean
  /** When near me is on, show distance per event */
  userPos?: { lat: number; lng: number } | null
  venueCoordsMap?: Map<string, { lat: number; lng: number }>
}

function DateNav({
  periodTitle,
  onPrev,
  onNext,
  onToday,
}: {
  periodTitle: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap bg-terminus-bg border-2 border-terminus-strong px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="p-2 text-terminus-fg hover:bg-terminus-muted"
          aria-label="Previous period"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={onNext}
          className="p-2 text-terminus-fg hover:bg-terminus-muted"
          aria-label="Next period"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-terminus-fg min-w-[140px] text-center">
          {periodTitle}
        </span>
      </div>
      <button
        onClick={onToday}
        className="terminus-btn px-3 py-1.5 text-xs uppercase tracking-wider"
      >
        Today
      </button>
    </div>
  )
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
    const lat = Number(e.extendedProps?.latitude)
    const lng = Number(e.extendedProps?.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
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
    if (calendarView === 'dayGridMonth') {
      return lisbonMonthBoundsFromKey(dateFocus)
    }
    if (calendarView === 'timeGridWeek') {
      return lisbonWeekBoundsFromKey(dateFocus)
    }
    return lisbonDayBoundsFromKey(dateFocus)
  }

  const { start, end } = getDateRange()
  const upcomingFloor = lisbonStartOfToday()

  const filteredEvents = (
    skipDateFilter
      ? events.filter((event) => new Date(event.start).getTime() >= upcomingFloor.getTime())
      : events.filter((event) => {
          const eventDate = new Date(event.start)
          return eventDate >= start && eventDate <= end
        })
  ).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const eventsByDay = new Map<string, NormalizedEvent[]>()
  filteredEvents.forEach((event) => {
    const dayKey = lisbonDateKey(new Date(event.start))
    if (!eventsByDay.has(dayKey)) eventsByDay.set(dayKey, [])
    eventsByDay.get(dayKey)!.push(event)
  })

  const formatDate = (dateStr: string) => {
    const todayKey = lisbonTodayKey()
    const tomorrowKey = addDaysKey(todayKey, 1)
    if (dateStr === todayKey) return 'Today'
    if (dateStr === tomorrowKey) return 'Tomorrow'
    const date = parseDateKeyLocal(dateStr)
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
    const startDt = new Date(event.start)
    const endDt = event.end ? new Date(event.end) : null
    const startTime = startDt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Lisbon',
    })
    if (endDt) {
      const endTime = endDt.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Lisbon',
      })
      return `${startTime} – ${endTime}`
    }
    return startTime
  }

  const getPeriodTitle = () => {
    const focusDate = parseDateKeyLocal(dateFocus)
    if (calendarView === 'dayGridMonth') {
      return focusDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    }
    if (calendarView === 'timeGridWeek') {
      const { start: ws, end: we } = lisbonWeekBoundsFromKey(dateFocus)
      return `${ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' })} – ${we.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' })}`
    }
    return focusDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const goPrev = () => {
    if (!onDateChange) return
    if (calendarView === 'dayGridMonth') {
      onDateChange(addMonthsKey(dateFocus, -1))
    } else if (calendarView === 'timeGridWeek') {
      onDateChange(addDaysKey(dateFocus, -7))
    } else {
      onDateChange(addDaysKey(dateFocus, -1))
    }
  }

  const goNext = () => {
    if (!onDateChange) return
    if (calendarView === 'dayGridMonth') {
      onDateChange(addMonthsKey(dateFocus, 1))
    } else if (calendarView === 'timeGridWeek') {
      onDateChange(addDaysKey(dateFocus, 7))
    } else {
      onDateChange(addDaysKey(dateFocus, 1))
    }
  }

  const goToday = () => {
    if (!onDateChange) return
    onDateChange(lisbonTodayKey())
  }

  const showNav = Boolean(onDateChange && !hideDateNav)

  if (filteredEvents.length === 0) {
    return (
      <div className="space-y-6">
        {showNav && (
          <DateNav
            periodTitle={getPeriodTitle()}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
          />
        )}
        <div className="flex items-center justify-center h-96">
          <div className="text-terminus-fg-muted">No events in this period</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showNav && (
        <DateNav
          periodTitle={getPeriodTitle()}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        />
      )}
      {Array.from(eventsByDay.entries()).map(([dayKey, dayEvents]) => (
        <div
          key={dayKey}
          className="border-2 border-terminus-strong bg-terminus-bg overflow-hidden"
        >
          <div className="bg-terminus-muted px-4 py-3 border-b-2 border-terminus-strong">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-terminus-fg">{formatDate(dayKey)}</div>
              <div className="text-xs text-terminus-fg-faint">
                {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="divide-y divide-terminus-border">
            {dayEvents.map((event) => {
              const distanceKm = getEventDistanceKm(event)
              const priceStr = event.extendedProps.isFree === true
                ? 'Free'
                : event.extendedProps.priceMin != null
                  ? `${event.extendedProps.priceMin}${event.extendedProps.priceMax && event.extendedProps.priceMax !== event.extendedProps.priceMin ? `–${event.extendedProps.priceMax}` : ''} ${event.extendedProps.currency === 'EUR' ? '€' : event.extendedProps.currency || '€'}`
                  : null
              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick({ event })}
                  className="px-4 py-4 min-h-[44px] hover:bg-terminus-muted transition-colors cursor-pointer touch-manipulation"
                >
                  <div className="flex items-start gap-3 md:gap-4">
                    <EventImageThumb
                      imageUrl={event.extendedProps.imageUrl}
                      imageUrls={event.extendedProps.imageUrls}
                      alt={event.title}
                      className="flex-shrink-0 w-24 h-24 md:w-20 md:h-20 border border-terminus-border bg-terminus-muted"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <h3 className="text-base font-semibold text-terminus-fg leading-tight">
                          {event.title}
                        </h3>
                        {priceStr && (
                          <span className="flex-shrink-0 text-xs font-medium tabular-nums text-terminus-fg-muted">
                            {priceStr}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-terminus-fg-muted tabular-nums mb-1">
                        {formatTime(event)}
                      </div>
                      {distanceKm != null && (
                        <div className="flex items-center gap-2 text-xs text-terminus-fg-muted mb-1">
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
                            href={venueHrefFromEvent(event)}
                            className="text-sm terminus-link"
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
                      {event.extendedProps.category && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="terminus-pill terminus-pill-active">
                            {event.extendedProps.category}
                          </span>
                        </div>
                      )}
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
