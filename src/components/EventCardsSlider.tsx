'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { NormalizedEvent } from '@/lib/eventsAdapter'
import { filterEvents } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'
import { useDebounce } from '@/lib/useDebounce'

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
  mode?: 'slider' | 'grid' // For list view, use grid
  hideHeader?: boolean // Hide the header (for mobile day sliders)
}

type TimeRange = 'today' | 'week'

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
}: EventCardsSliderProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [localCategories, setLocalCategories] = useState<string[]>(selectedCategories)
  const [localTags, setLocalTags] = useState<string[]>(selectedTags)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Debounce filter changes for instant feel (200ms)
  const debouncedCategories = useDebounce(localCategories, 200)
  const debouncedTags = useDebounce(localTags, 200)

  // Sync local state with props
  useEffect(() => {
    setLocalCategories(selectedCategories)
  }, [selectedCategories])

  useEffect(() => {
    setLocalTags(selectedTags)
  }, [selectedTags])

  // Get date range
  const dateRange = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    if (timeRange === 'today') {
      return {
        start: today,
        end: tomorrow,
      }
    } else {
      return {
        start: today,
        end: nextWeek,
      }
    }
  }, [timeRange])

  // Sync debounced filters to parent (only when they actually change)
  useEffect(() => {
    const categoriesChanged = JSON.stringify(debouncedCategories.sort()) !== JSON.stringify(selectedCategories.sort())
    if (categoriesChanged && onCategoriesChange) {
      onCategoriesChange(debouncedCategories)
    }
  }, [debouncedCategories])

  useEffect(() => {
    const tagsChanged = JSON.stringify(debouncedTags.sort()) !== JSON.stringify(selectedTags.sort())
    if (tagsChanged && onTagsChange) {
      onTagsChange(debouncedTags)
    }
  }, [debouncedTags])

  // Filter events by date range and other filters
  const filteredEvents = useMemo(() => {
    let filtered = events.filter((event) => {
      const eventDate = new Date(event.start)
      return eventDate >= dateRange.start && eventDate < dateRange.end
    })

    // Apply existing filters (use local state for instant UI, debounced for parent sync)
    filtered = filterEvents(filtered, {
      selectedTags: localTags,
      categories: localCategories.length > 0 ? localCategories : undefined,
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

    // Exclude continuous events
    if (excludeContinuous) {
      filtered = filtered.filter((event) => {
        if (!event.allDay) return true
        if (event.end) {
          const start = new Date(event.start)
          const end = new Date(event.end)
          const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
          return daysDiff <= 1
        }
        return true
      })
    }

    // Sort: today = chronological, week = by day then time
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

    return filtered
  }, [events, dateRange, localTags, localCategories, freeOnly, excludeExhibitions, excludeContinuous, timeRange])

  // Mouse drag handlers for slider
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'slider') return
    setIsDragging(true)
    setStartX(e.pageX - (sliderRef.current?.offsetLeft || 0))
    setScrollLeft(sliderRef.current?.scrollLeft || 0)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || mode !== 'slider') return
    e.preventDefault()
    const x = e.pageX - (sliderRef.current?.offsetLeft || 0)
    const walk = (x - startX) * 2
    if (sliderRef.current) {
      sliderRef.current.scrollLeft = scrollLeft - walk
    }
  }

  // Touch handlers for mobile
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
    if (sliderRef.current) {
      sliderRef.current.scrollLeft = scrollLeft - walk
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Scroll buttons
  const scrollLeftBtn = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: -300, behavior: 'smooth' })
    }
  }

  const scrollRightBtn = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: 300, behavior: 'smooth' })
    }
  }

  // Always show the slider, even if no events - display a helpful message

  const handleRemoveTag = (tag: string) => {
    const newTags = selectedTags.filter(t => t !== tag)
    onTagsChange?.(newTags)
  }

  return (
    <div className="w-full mt-6 md:mt-8">
      {/* Header with toggle and count - Hidden if hideHeader is true */}
      {!hideHeader && (
      <div className="flex items-center justify-between mb-4 px-4 md:px-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Segmented control */}
          <div className="flex bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
            <button
              onClick={() => setTimeRange('today')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                timeRange === 'today'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange('week')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                timeRange === 'week'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              This week
            </button>
          </div>
          
          {timeRange === 'week' && (
            <span className="text-xs text-slate-400 hidden md:inline">Next 7 days</span>
          )}

          {/* Selected Tags Preview */}
          {selectedTags && selectedTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-700/80 border border-slate-600/50 text-slate-200"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:bg-slate-600/80 rounded-full p-0.5 transition-colors flex items-center justify-center"
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
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} match
          </span>
        </div>
      </div>
      )}

      {/* Cards container */}
      {filteredEvents.length > 0 ? (
        <div className="relative overflow-hidden">
          {mode === 'slider' && (
            <>
              {/* Left scroll button */}
              <button
                onClick={scrollLeftBtn}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/90 transition-all shadow-lg hidden md:block"
                aria-label="Scroll left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Right scroll button */}
              <button
                onClick={scrollRightBtn}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/90 transition-all shadow-lg hidden md:block"
                aria-label="Scroll right"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
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
            className={`${
              mode === 'slider'
                ? 'flex gap-4 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth px-4 md:px-6 pb-4'
                : 'grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6'
            } ${isDragging ? 'cursor-grabbing' : mode === 'slider' ? 'cursor-grab' : ''}`}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} onClick={() => onEventClick(event)} mode={mode} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 px-4 md:px-6">
          <div className="text-center py-8 px-4">
            <div className="text-slate-300 text-base font-medium mb-2">No events found for {timeRange === 'today' ? 'today' : 'this week'}</div>
            <div className="text-slate-400 text-sm">Try broadening your search or adjusting your filters</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Individual Event Card Component
function EventCard({ event, onClick, mode }: { event: NormalizedEvent; onClick: () => void; mode: 'slider' | 'grid' }) {
  const props = event.extendedProps
  const categoryColor = getCategoryColor(props.category)
  const startDate = new Date(event.start)
  const endDate = event.end ? new Date(event.end) : null

  const formatDate = () => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const eventDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const tomorrowDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())

    if (eventDay.getTime() === todayDay.getTime()) {
      return 'Today'
    } else if (eventDay.getTime() === tomorrowDay.getTime()) {
      return 'Tomorrow'
    } else {
      return startDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    }
  }

  const formatTime = () => {
    if (event.allDay) return 'All day'
    return startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const formatPrice = () => {
    if (props.isFree) return 'Free'
    if (props.priceMin !== undefined && props.priceMax !== undefined) {
      if (props.priceMin === props.priceMax) {
        return `${props.priceMin} ${props.currency || 'EUR'}`
      }
      return `${props.priceMin}-${props.priceMax} ${props.currency || 'EUR'}`
    }
    if (props.priceMin !== undefined) {
      return `From ${props.priceMin} ${props.currency || 'EUR'}`
    }
    return null
  }

  const displayTags = props.tags.slice(0, 2)

  return (
    <div
      onClick={onClick}
      className={`bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02] ${
        mode === 'slider' ? 'min-w-[280px] md:min-w-[320px] flex-shrink-0' : ''
      }`}
    >
      {/* Title */}
      <h3 className="text-base font-semibold text-white mb-2 line-clamp-2 min-h-[2.5rem]">
        {event.title}
      </h3>

      {/* Date & Time */}
      <div className="flex items-center gap-2 mb-2 text-sm text-slate-300">
        <span className="font-medium">{formatDate()}</span>
        <span>•</span>
        <span>{formatTime()}</span>
      </div>

      {/* Venue */}
      {props.venueName && (
        <div className="text-sm text-slate-400 mb-3 line-clamp-1">
          {props.venueName}
        </div>
      )}

      {/* Category & Tags */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {props.category && (
          <span
            className="px-2 py-1 rounded text-xs font-medium text-white"
            style={{ backgroundColor: categoryColor }}
          >
            {props.category}
          </span>
        )}
        {displayTags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 rounded text-xs bg-slate-700/50 text-slate-300 border border-slate-600/50"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Price & Source */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-700/50">
        {formatPrice() && (
          <span className="text-sm font-medium text-slate-200">{formatPrice()}</span>
        )}
        {props.sourceName && (
          <span className="text-xs text-slate-500 uppercase">{props.sourceName}</span>
        )}
      </div>
    </div>
  )
}
