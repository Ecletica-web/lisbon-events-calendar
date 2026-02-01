'use client'

import { useEffect, useState, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import {
  fetchEvents,
  filterEvents,
  getAllTags,
  getAllCategories,
  type NormalizedEvent,
} from '@/lib/eventsAdapter'

interface EventModalProps {
  event: NormalizedEvent | null
  onClose: () => void
}

function EventModal({ event, onClose }: EventModalProps) {
  if (!event) return null

  const startDate = new Date(event.start)
  const endDate = event.end ? new Date(event.end) : null
  const props = event.extendedProps

  const formatDateTime = (date: Date) => {
    const timezone = props.timezone || 'Europe/Lisbon'
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: event.allDay ? undefined : 'short',
      timeZone: timezone,
    }).format(date)
  }

  const formatPrice = () => {
    if (props.isFree) return 'Free'
    if (props.priceMin !== undefined && props.priceMax !== undefined) {
      if (props.priceMin === props.priceMax) {
        return `${props.priceMin} ${props.currency || 'EUR'}`
      }
      return `${props.priceMin} - ${props.priceMax} ${props.currency || 'EUR'}`
    }
    if (props.priceMin !== undefined) {
      return `From ${props.priceMin} ${props.currency || 'EUR'}`
    }
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        {props.imageUrl && (
          <img
            src={props.imageUrl}
            alt={event.title}
            className="w-full h-48 object-cover rounded mb-4"
          />
        )}
        
        <h2 className="text-2xl font-bold mb-4">{event.title}</h2>
        
        <div className="space-y-3 mb-4">
          <div>
            <strong>Date/Time:</strong>
            <div>
              {formatDateTime(startDate)}
              {endDate && ` - ${formatDateTime(endDate)}`}
              {event.allDay && <span className="text-sm text-gray-600"> (All Day)</span>}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Timezone: {props.timezone || 'Europe/Lisbon'}
            </div>
          </div>

          {props.descriptionShort && (
            <div>
              <strong>Description:</strong>
              <p className="mt-1">{props.descriptionShort}</p>
            </div>
          )}

          {props.descriptionLong && (
            <div>
              <strong>Full Description:</strong>
              <p className="mt-1 whitespace-pre-wrap">{props.descriptionLong}</p>
            </div>
          )}

          {props.venueName && (
            <div>
              <strong>Venue:</strong> {props.venueName}
              {props.venueAddress && (
                <div className="text-sm text-gray-600 mt-1">{props.venueAddress}</div>
              )}
              {props.neighborhood && (
                <div className="text-sm text-gray-600">{props.neighborhood}</div>
              )}
              {props.city && (
                <div className="text-sm text-gray-600">{props.city}</div>
              )}
            </div>
          )}

          {formatPrice() && (
            <div>
              <strong>Price:</strong> {formatPrice()}
            </div>
          )}

          {props.category && (
            <div>
              <strong>Category:</strong>{' '}
              <span className="bg-blue-100 px-2 py-1 rounded text-sm">
                {props.category}
              </span>
            </div>
          )}

          {props.tags.length > 0 && (
            <div>
              <strong>Tags:</strong>
              <div className="flex flex-wrap gap-2 mt-1">
                {props.tags.map((tag) => (
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

          {props.language && (
            <div>
              <strong>Language:</strong> {props.language}
            </div>
          )}

          {props.ageRestriction && (
            <div>
              <strong>Age Restriction:</strong> {props.ageRestriction}
            </div>
          )}

          {props.ticketUrl && (
            <div>
              <strong>Tickets:</strong>{' '}
              <a
                href={props.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Buy Tickets
              </a>
            </div>
          )}

          {props.sourceUrl && (
            <div>
              <strong>Source:</strong>{' '}
              <a
                href={props.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View Source
              </a>
              {props.sourceName && (
                <span className="text-sm text-gray-600 ml-2">({props.sourceName})</span>
              )}
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
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [freeOnly, setFreeOnly] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)

  useEffect(() => {
    async function loadEvents() {
      setLoading(true)
      try {
        const fetchedEvents = await fetchEvents()
        console.log('Fetched events:', fetchedEvents.length)
        setEvents(fetchedEvents)
      } catch (error) {
        console.error('Error loading events:', error)
        setEvents([])
      } finally {
        setLoading(false)
      }
    }
    loadEvents()
  }, [])

  const allTags = useMemo(() => getAllTags(events), [events])
  const allCategories = useMemo(() => getAllCategories(events), [events])
  const filteredEvents = useMemo(
    () =>
      filterEvents(events, {
        searchQuery,
        selectedTags,
        category: selectedCategory || undefined,
        freeOnly,
      }),
    [events, searchQuery, selectedTags, selectedCategory, freeOnly]
  )

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedTags([])
    setSelectedCategory('')
    setFreeOnly(false)
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
        <div className="w-64 border-r border-gray-200 p-4 bg-gray-50 min-h-[calc(100vh-80px)] overflow-y-auto">
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">Timezone</div>
            <div className="font-medium">Europe/Lisbon</div>
          </div>

          <div className="mb-4">
            <div className="text-sm font-semibold mb-2">Free Events Only</div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Show only free events</span>
            </label>
          </div>

          {allCategories.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-semibold mb-2">Category</div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">All Categories</option>
                {allCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2">Filter by Tags</div>
            {loading ? (
              <div className="text-sm text-gray-500">Loading tags...</div>
            ) : allTags.length === 0 ? (
              <div className="text-sm text-gray-500">No tags available</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
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
              allDayText="All Day"
            />
          )}
        </div>
      </div>

      {/* Event Modal */}
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
