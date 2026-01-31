'use client'

import { useEffect, useState, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import { fetchEvents, filterEvents, getAllTags, type NormalizedEvent } from '@/lib/events'

interface EventModalProps {
  event: NormalizedEvent | null
  onClose: () => void
}

function EventModal({ event, onClose }: EventModalProps) {
  if (!event) return null

  const startDate = new Date(event.start)
  const endDate = event.end ? new Date(event.end) : null

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Lisbon',
    }).format(date)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">{event.title}</h2>
        
        <div className="space-y-3 mb-4">
          <div>
            <strong>Date/Time:</strong>
            <div>
              {formatDateTime(startDate)}
              {endDate && ` - ${formatDateTime(endDate)}`}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Timezone: Europe/Lisbon
            </div>
          </div>

          {event.extendedProps.venue && (
            <div>
              <strong>Venue:</strong> {event.extendedProps.venue}
            </div>
          )}

          {event.extendedProps.tags.length > 0 && (
            <div>
              <strong>Tags:</strong>
              <div className="flex flex-wrap gap-2 mt-1">
                {event.extendedProps.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-gray-100 px-2 py-1 rounded text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {event.extendedProps.sourceUrl && (
            <div>
              <strong>Source:</strong>{' '}
              <a
                href={event.extendedProps.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View Source
              </a>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
        >
          Close
        </button>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)

  useEffect(() => {
    async function loadEvents() {
      setLoading(true)
      const fetchedEvents = await fetchEvents()
      setEvents(fetchedEvents)
      setLoading(false)
    }
    loadEvents()
  }, [])

  const allTags = useMemo(() => getAllTags(events), [events])
  const filteredEvents = useMemo(
    () => filterEvents(events, searchQuery, selectedTags),
    [events, searchQuery, selectedTags]
  )

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedTags([])
  }

  const handleEventClick = (info: any) => {
    const event = filteredEvents.find((e) => e.id === info.event.id)
    if (event) {
      setSelectedEvent(event)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <div className="border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center justify-between">
          <h1 className="text-2xl font-bold">Lisbon Events Calendar</h1>
          
          <div className="flex gap-2 flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-2"
            />
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Left Sidebar */}
        <div className="w-64 border-r border-gray-200 p-4 bg-gray-50 min-h-[calc(100vh-80px)]">
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">Timezone</div>
            <div className="font-medium">Europe/Lisbon</div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Filter by Tags</div>
            {loading ? (
              <div className="text-sm text-gray-500">Loading tags...</div>
            ) : allTags.length === 0 ? (
              <div className="text-sm text-gray-500">No tags available</div>
            ) : (
              <div className="space-y-2">
                {allTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={() => handleTagToggle(tag)}
                      className="rounded"
                    />
                    <span className="text-sm">{tag}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Calendar Area */}
        <div className="flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-gray-500">Loading events...</div>
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
              }}
              events={filteredEvents}
              eventClick={handleEventClick}
              firstDay={1} // Monday
              nowIndicator={true}
              timeZone="Europe/Lisbon"
              editable={false}
              droppable={false}
              selectable={false}
              height="auto"
              eventDisplay="block"
            />
          )}
        </div>
      </div>

      {/* Event Modal */}
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
