'use client'

import { getCategoryColor } from '@/lib/categoryColors'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import type { ViewState } from '@/lib/viewState'

interface EventListViewProps {
  events: NormalizedEvent[]
  calendarView: ViewState['viewMode']
  dateFocus: string
  onEventClick: (info: { event: { id: string } }) => void
}

export default function EventListView({
  events,
  calendarView,
  dateFocus,
  onEventClick,
}: EventListViewProps) {
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
  const filteredEvents = events
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

  if (filteredEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">No events in this period</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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
              const priceStr = event.extendedProps.isFree
                ? 'Free'
                : event.extendedProps.priceMin != null
                  ? `${event.extendedProps.priceMin}${event.extendedProps.priceMax && event.extendedProps.priceMax !== event.extendedProps.priceMin ? `–${event.extendedProps.priceMax}` : ''} ${event.extendedProps.currency === 'EUR' ? '€' : event.extendedProps.currency || '€'}`
                  : null
              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick({ event })}
                  className="px-4 py-4 hover:bg-slate-700/30 transition-colors cursor-pointer"
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
                      {event.extendedProps.venueName && (
                        <div className="text-sm text-slate-300 mb-2">
                          {event.extendedProps.venueName}
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
