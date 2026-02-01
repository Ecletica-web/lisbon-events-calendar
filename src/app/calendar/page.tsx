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
import { getCategoryColor, generateColorFromString } from '@/lib/categoryColors'
import { useDebounce } from '@/lib/useDebounce'

interface EventModalProps {
  event: NormalizedEvent | null
  onClose: () => void
}

function EventModal({ event, onClose }: EventModalProps) {
  if (!event) return null

  const startDate = new Date(event.start)
  const endDate = event.end ? new Date(event.end) : null
  const props = event.extendedProps
  const categoryColor = getCategoryColor(props.category)

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
              <span
                className="px-2 py-1 rounded text-sm text-white font-medium"
                style={{ backgroundColor: categoryColor }}
              >
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
  const [tagSearchQuery, setTagSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [freeOnly, setFreeOnly] = useState(false)
  const [excludeExhibitions, setExcludeExhibitions] = useState(false)
  const [excludeContinuous, setExcludeContinuous] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)

  // Debounce search for performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    async function loadEvents() {
      setLoading(true)
      try {
        console.log('Starting to fetch events...')
        const fetchedEvents = await fetchEvents()
        console.log('Fetched events:', fetchedEvents.length)
        if (fetchedEvents.length === 0) {
          console.warn('No events found. Check CSV URL and data structure.')
        }
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

  // Memoize all tags and categories
  const allTags = useMemo(() => getAllTags(events), [events])
  const allCategories = useMemo(() => getAllCategories(events), [events])

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return allTags
    const query = tagSearchQuery.toLowerCase()
    return allTags.filter((tag) => tag.toLowerCase().includes(query))
  }, [allTags, tagSearchQuery])

  // Apply category colors to events
  const eventsWithColors = useMemo(() => {
    return events.map((event) => {
      // Try category first, then generate from tags if no category
      let categoryColor = getCategoryColor(event.extendedProps.category)
      
      // If no category, try to get color from first tag
      if (!event.extendedProps.category && event.extendedProps.tags.length > 0) {
        const tagColor = getCategoryColor(event.extendedProps.tags[0])
        if (tagColor !== getCategoryColor(undefined)) {
          categoryColor = tagColor
        }
      }
      
      return {
        ...event,
        backgroundColor: categoryColor,
        borderColor: categoryColor,
        textColor: '#ffffff',
      }
    })
  }, [events])

  // Filter events with debounced search
  const filteredEvents = useMemo(
    () => {
      let filtered = filterEvents(eventsWithColors, {
        searchQuery: debouncedSearchQuery,
        selectedTags,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        freeOnly,
      })
      
      // Exclude exhibitions
      if (excludeExhibitions) {
        filtered = filtered.filter((event) => {
          const category = event.extendedProps.category?.toLowerCase()
          const tags = event.extendedProps.tags.map((t) => t.toLowerCase())
          return category !== 'arts' && !tags.includes('exhibition')
        })
      }
      
      // Exclude continuous events (all-day events that span multiple days)
      if (excludeContinuous) {
        filtered = filtered.filter((event) => {
          if (!event.allDay) return true
          // If it's all-day but has an end date, check if it spans more than 1 day
          if (event.end) {
            const start = new Date(event.start)
            const end = new Date(event.end)
            const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
            return daysDiff <= 1
          }
          return true
        })
      }
      
      return filtered
    },
    [eventsWithColors, debouncedSearchQuery, selectedTags, selectedCategories, freeOnly, excludeExhibitions, excludeContinuous]
  )

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const handleClearCategory = (category: string) => {
    setSelectedCategories((prev) => prev.filter((c) => c !== category))
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setTagSearchQuery('')
    setSelectedTags([])
    setSelectedCategories([])
    setFreeOnly(false)
    setExcludeExhibitions(false)
    setExcludeContinuous(false)
  }

  const handleEventClick = (info: any) => {
    const event = filteredEvents.find((e) => e.id === info.event.id)
    if (event) {
      setSelectedEvent(event)
    }
  }

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (debouncedSearchQuery) count++
    if (selectedTags.length > 0) count++
    if (selectedCategories.length > 0) count++
    if (freeOnly) count++
    if (excludeExhibitions) count++
    if (excludeContinuous) count++
    return count
  }, [debouncedSearchQuery, selectedTags.length, selectedCategories.length, freeOnly, excludeExhibitions, excludeContinuous])

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <div className="border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lisbon Events Calendar</h1>
            {!loading && (
              <div className="text-sm text-gray-600 mt-1">
                {filteredEvents.length} of {events.length} events
                {activeFiltersCount > 0 && ` (${activeFiltersCount} filter${activeFiltersCount > 1 ? 's' : ''} active)`}
              </div>
            )}
          </div>
          
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
              disabled={activeFiltersCount === 0}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Left Sidebar */}
        <div className="w-72 border-r border-gray-200 p-4 bg-gray-50 min-h-[calc(100vh-120px)] overflow-y-auto">
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">Timezone</div>
            <div className="font-medium">Europe/Lisbon</div>
          </div>

          <div className="mb-4">
            <div className="text-sm font-semibold mb-2">Filters</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={(e) => setFreeOnly(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Free events only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeExhibitions}
                  onChange={(e) => setExcludeExhibitions(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Exclude exhibitions</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeContinuous}
                  onChange={(e) => setExcludeContinuous(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Exclude continuous events</span>
              </label>
            </div>
          </div>

          {allCategories.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-semibold mb-2">
                Category
                {selectedCategories.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({selectedCategories.length} selected)
                  </span>
                )}
              </div>
              
              {/* All Categories Button */}
              <div className="mb-2">
                <button
                  onClick={() => setSelectedCategories([])}
                  className={`px-3 py-1 rounded text-sm font-medium border transition-all ${
                    selectedCategories.length === 0
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  All Categories
                </button>
              </div>
              
              {/* Category Selection Buttons */}
              <div className="flex flex-wrap gap-2">
                {allCategories.map((category) => {
                  const color = getCategoryColor(category)
                  const isSelected = selectedCategories.includes(category)
                  return (
                    <button
                      key={category}
                      onClick={() => handleCategoryToggle(category)}
                      className={`px-3 py-1 rounded text-sm font-medium border-2 transition-all ${
                        isSelected
                          ? 'text-white shadow-md'
                          : 'text-gray-700 hover:opacity-80'
                      }`}
                      style={{
                        backgroundColor: isSelected ? color : 'transparent',
                        borderColor: color,
                        color: isSelected ? '#ffffff' : color,
                      }}
                    >
                      {category}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2">
              Filter by Tags ({allTags.length} total)
              {selectedTags.length > 0 && (
                <span className="ml-2 text-xs text-gray-500">
                  ({selectedTags.length} selected)
                </span>
              )}
            </div>
            {loading ? (
              <div className="text-sm text-gray-500">Loading tags...</div>
            ) : allTags.length === 0 ? (
              <div className="text-sm text-gray-500">No tags available</div>
            ) : (
              <>
                {/* Popular Tags Quick Select */}
                {allTags.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-600 mb-1">Popular tags:</div>
                    <div className="flex flex-wrap gap-1">
                      {allTags.slice(0, 8).map((tag) => {
                        const isSelected = selectedTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            onClick={() => handleTagToggle(tag)}
                            className={`px-2 py-1 rounded text-xs border transition-all ${
                              isSelected
                                ? 'bg-blue-100 border-blue-300 text-blue-800'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search and select tags..."
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    onFocus={(e) => {
                      // Keep dropdown open when clicking input
                      e.stopPropagation()
                    }}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                
                {/* Dropdown */}
                {tagSearchQuery.trim() && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-64 overflow-y-auto">
                    {filteredTags.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No tags match your search</div>
                    ) : (
                      filteredTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag)
                        return (
                          <label
                            key={tag}
                            className={`flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 ${
                              isSelected ? 'bg-blue-50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleTagToggle(tag)}
                              className="rounded"
                            />
                            <span className="text-sm flex-1">{tag}</span>
                          </label>
                        )
                      })
                    )}
                  </div>
                )}
                
                {/* Selected Tags Display */}
                {selectedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-800"
                      >
                        {tag}
                        <button
                          onClick={() => handleTagToggle(tag)}
                          className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                          aria-label={`Remove ${tag}`}
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => setSelectedTags([])}
                      className="text-xs text-blue-600 hover:underline px-2 py-1"
                    >
                      Clear all
                    </button>
                  </div>
                )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Main Calendar Area */}
        <div className="flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-gray-500">Loading events...</div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="text-gray-500 text-lg mb-2">No events found</div>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={handleClearFilters}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Clear filters to see all events
                  </button>
                )}
              </div>
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
              eventTextColor="#ffffff"
              // Hide hours 2am-8am and center view around 5-10pm
              slotMinTime="08:00:00"
              slotMaxTime="26:00:00"
              scrollTime="17:30:00"
              slotLabelInterval={{ hours: 1 }}
            />
          )}
        </div>
      </div>

      {/* Event Modal */}
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
