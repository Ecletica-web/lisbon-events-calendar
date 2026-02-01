'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { NormalizedEvent } from '@/lib/eventsAdapter'
import { filterEvents, getAllTags, getAllCategories } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'
import { normalizeCategory } from '@/lib/categoryNormalization'
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
}: EventCardsSliderProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [showFilters, setShowFilters] = useState(false)
  const [localCategories, setLocalCategories] = useState<string[]>(selectedCategories)
  const [localTags, setLocalTags] = useState<string[]>(selectedTags)
  const [tagSearchQuery, setTagSearchQuery] = useState('')
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

  // Get available categories and tags
  const allCategories = useMemo(() => getAllCategories(events), [events])
  const allTags = useMemo(() => {
    let tags: string[] = []
    if (localCategories.length > 0) {
      // Only show tags from selected categories
      const categorySet = new Set(localCategories.map(c => normalizeCategory(c)))
      tags = getAllTags(events).filter(tag => {
        // Check if any event with this tag has one of the selected categories
        return events.some(event => 
          event.extendedProps.tags.includes(tag) &&
          event.extendedProps.category &&
          categorySet.has(normalizeCategory(event.extendedProps.category))
        )
      })
    } else {
      // Show popular tags (top 20 by frequency) or all if less than 20
      const tagCounts = new Map<string, number>()
      events.forEach(event => {
        event.extendedProps.tags.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        })
      })
      const sortedTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)
      tags = sortedTags.slice(0, 20)
    }
    
    // Filter by search query
    if (tagSearchQuery.trim()) {
      const query = tagSearchQuery.toLowerCase()
      tags = tags.filter(tag => tag.toLowerCase().includes(query))
    }
    
    return tags
  }, [events, localCategories, tagSearchQuery])

  // Handle category toggle
  const handleCategoryToggle = (category: string) => {
    const newCategories = localCategories.includes(category)
      ? localCategories.filter(c => c !== category)
      : [...localCategories, category]
    setLocalCategories(newCategories)
    onCategoriesChange?.(newCategories)
    // Clear tags that don't belong to new categories
    if (newCategories.length > 0) {
      const categorySet = new Set(newCategories.map(c => normalizeCategory(c)))
      const validTags = localTags.filter(tag => {
        return events.some(event => 
          event.extendedProps.tags.includes(tag) &&
          event.extendedProps.category &&
          categorySet.has(normalizeCategory(event.extendedProps.category))
        )
      })
      setLocalTags(validTags)
      onTagsChange?.(validTags)
    }
  }

  // Handle tag toggle
  const handleTagToggle = (tag: string) => {
    const newTags = localTags.includes(tag)
      ? localTags.filter(t => t !== tag)
      : [...localTags, tag]
    setLocalTags(newTags)
    onTagsChange?.(newTags)
  }

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

  if (filteredEvents.length === 0 && !showFilters) {
    return null
  }

  return (
    <div className="w-full mt-6 md:mt-8">
      {/* Header with toggle and count */}
      <div className="flex items-center justify-between mb-4 px-4 md:px-6">
        <div className="flex items-center gap-4">
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
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} match
          </span>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            {showFilters ? 'Hide' : 'Filter'}
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 px-4 md:px-6 space-y-4">
          {/* Categories */}
          <div>
            <div className="text-xs font-semibold mb-2 text-slate-300">Categories</div>
            <div className="flex flex-wrap gap-2">
              {allCategories.map((category) => {
                const color = getCategoryColor(category)
                const isSelected = localCategories.includes(category)
                return (
                  <button
                    key={category}
                    onClick={() => handleCategoryToggle(category)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                      isSelected
                        ? 'text-white shadow-md'
                        : 'text-slate-300 hover:opacity-90 bg-slate-800/80'
                    }`}
                    style={{
                      backgroundColor: isSelected ? color : 'transparent',
                      borderColor: color,
                    }}
                  >
                    {category}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="text-xs font-semibold mb-2 text-slate-300">
              Tags {localCategories.length > 0 && '(from selected categories)'}
            </div>
            
            {/* Tag search input */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search tags..."
                value={tagSearchQuery}
                onChange={(e) => setTagSearchQuery(e.target.value)}
                className="w-full border border-slate-600/50 rounded-lg px-3 py-2 text-sm bg-slate-900/80 backdrop-blur-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-lg"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              {allTags.length === 0 ? (
                <div className="text-sm text-slate-400 py-2">
                  {tagSearchQuery.trim() ? 'No tags match your search' : 'No tags available'}
                </div>
              ) : (
                allTags.map((tag) => {
                  const isSelected = localTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTagToggle(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white border-transparent shadow-md'
                          : 'bg-slate-800/80 border-slate-600/50 text-slate-300 hover:bg-slate-700/80'
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cards container */}
      {filteredEvents.length > 0 ? (
        <div className="relative">
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
                ? 'flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-4 md:px-6 pb-4'
                : 'grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6'
            } ${isDragging ? 'cursor-grabbing' : mode === 'slider' ? 'cursor-grab' : ''}`}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} onClick={() => onEventClick(event)} mode={mode} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 px-4 md:px-6">
          <div className="text-slate-400 text-sm">No events found for {timeRange === 'today' ? 'today' : 'this week'}</div>
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
