'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { generateColorShade } from '@/lib/colorShades'
import { useDebounce } from '@/lib/useDebounce'
import {
  ViewState,
  DEFAULT_VIEW_STATE,
  serializeViewStateToURL,
  deserializeViewStateFromURL,
  mergeViewState,
} from '@/lib/viewState'
import {
  getSavedViews,
  saveView,
  updateView,
  deleteView,
  setViewAsDefault,
  getDefaultView,
  type SavedView,
} from '@/lib/savedViews'
import { useSession } from 'next-auth/react'
import { loadSavedViewsFromDB, saveViewToDB } from '@/lib/savedViewsSync'

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
        
        <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">{event.title}</h2>
        
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
          className="w-full bg-gradient-to-r from-gray-200 to-gray-300 hover:from-gray-300 hover:to-gray-400 px-6 py-3 rounded-xl font-medium text-gray-800 transition-all shadow-md hover:shadow-lg mt-6"
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
  const [excludeContinuous, setExcludeContinuous] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)
  
  // View state
  const [calendarView, setCalendarView] = useState<ViewState['viewMode']>('dayGridMonth')
  const [dateFocus, setDateFocus] = useState<string>(DEFAULT_VIEW_STATE.dateFocus)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [showSavedViewsMenu, setShowSavedViewsMenu] = useState(false)
  const [editingViewId, setEditingViewId] = useState<string | null>(null)
  const [editingViewName, setEditingViewName] = useState('')
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const calendarRef = useRef<FullCalendar>(null)
  const { data: session } = useSession()

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

  // Hydrate from URL on mount and load saved views
  useEffect(() => {
    const urlState = deserializeViewStateFromURL(searchParams)
    if (Object.keys(urlState).length > 0) {
      const merged = mergeViewState(urlState)
      setSearchQuery(merged.searchQuery)
      setSelectedCategories(merged.selectedCategories)
      setSelectedTags(merged.selectedTags)
      setFreeOnly(merged.toggles.freeOnly)
      setExcludeExhibitions(merged.toggles.excludeExhibitions)
      setExcludeContinuous(merged.toggles.excludeContinuous)
      setCalendarView(merged.viewMode)
      setDateFocus(merged.dateFocus)
    } else {
      // Try to load default saved view
      const defaultView = getDefaultView()
      if (defaultView) {
        const merged = mergeViewState(defaultView.state)
        setSearchQuery(merged.searchQuery)
        setSelectedCategories(merged.selectedCategories)
        setSelectedTags(merged.selectedTags)
        setFreeOnly(merged.toggles.freeOnly)
        setExcludeExhibitions(merged.toggles.excludeExhibitions)
        setExcludeContinuous(merged.toggles.excludeContinuous)
        setCalendarView(merged.viewMode)
        setDateFocus(merged.dateFocus)
      }
    }
    
    // Load saved views (from DB if logged in, else localStorage)
    loadSavedViews()
  }, [searchParams])

  const loadSavedViews = async () => {
    if (session?.user) {
      // Load from database if logged in
      const dbViews = await loadSavedViewsFromDB()
      if (dbViews.length > 0) {
        setSavedViews(dbViews.map((v) => ({
          id: v.id,
          name: v.name,
          state: v.state,
          isDefault: v.isDefault,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })))
        return
      }
    }
    
    // Fallback to localStorage
    setSavedViews(getSavedViews())
  }

  // Sync to URL (debounced)
  useEffect(() => {
    const currentState: ViewState = {
      viewMode: calendarView,
      dateFocus,
      searchQuery,
      selectedCategories,
      selectedTags,
      toggles: {
        freeOnly,
        excludeExhibitions,
        excludeContinuous,
      },
    }
    
    const params = serializeViewStateToURL(currentState)
    const url = new URL(window.location.href)
    
    // Clear existing params
    url.search = ''
    
    // Add new params
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    
    // Update URL without page reload (debounced)
    const timeoutId = setTimeout(() => {
      router.replace(url.pathname + url.search, { scroll: false })
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }, [calendarView, dateFocus, searchQuery, selectedCategories, selectedTags, freeOnly, excludeExhibitions, excludeContinuous, router])

  // Memoize all tags and categories
  const allTags = useMemo(() => getAllTags(events), [events])
  const allCategories = useMemo(() => getAllCategories(events), [events])

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return allTags
    const query = tagSearchQuery.toLowerCase()
    return allTags.filter((tag) => tag.toLowerCase().includes(query))
  }, [allTags, tagSearchQuery])

  // Apply category colors to events with shades for same-day, same-category events
  const eventsWithColors = useMemo(() => {
    // First pass: group events by day and category
    const eventsByDayAndCategory = new Map<string, NormalizedEvent[]>()
    
    events.forEach((event) => {
      const startDate = new Date(event.start)
      const dayKey = startDate.toISOString().split('T')[0] // YYYY-MM-DD
      const category = event.extendedProps.category || 'default'
      const groupKey = `${dayKey}-${category}`
      
      if (!eventsByDayAndCategory.has(groupKey)) {
        eventsByDayAndCategory.set(groupKey, [])
      }
      eventsByDayAndCategory.get(groupKey)!.push(event)
    })
    
    // Second pass: assign colors with shades
    const colorAssignments = new Map<string, number>() // event.id -> shade index
    
    eventsByDayAndCategory.forEach((groupEvents) => {
      if (groupEvents.length > 1) {
        // Multiple events in same category on same day - assign shades
        groupEvents.forEach((event, index) => {
          colorAssignments.set(event.id, index)
        })
      } else {
        // Single event - use base color (index 0)
        colorAssignments.set(groupEvents[0].id, 0)
      }
    })
    
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
      
      // Get shade index for this event
      const shadeIndex = colorAssignments.get(event.id) || 0
      const groupKey = `${new Date(event.start).toISOString().split('T')[0]}-${event.extendedProps.category || 'default'}`
      const groupSize = eventsByDayAndCategory.get(groupKey)?.length || 1
      
      // Generate shade if there are multiple events in same category on same day
      const finalColor = groupSize > 1 
        ? generateColorShade(categoryColor, shadeIndex, groupSize)
        : categoryColor
      
      // Store original end time for day view
      const originalEnd = event.end
      
      // Handle long night music events - prevent spanning multiple days in month/week views
      // We'll adjust this in the eventContent callback based on current view
      const startDate = new Date(event.start)
      const endDate = event.end ? new Date(event.end) : null
      
      let isLongNightMusicEvent = false
      if (endDate && !event.allDay) {
        const startHour = startDate.getHours()
        const category = event.extendedProps.category?.toLowerCase() || ''
        const tags = event.extendedProps.tags.map(t => t.toLowerCase())
        const isMusic = category === 'music' || tags.some(t => 
          ['music', 'concert', 'dj', 'nightlife', 'club', 'party', 'techno', 'electronic'].includes(t)
        )
        
        // Check if it's a night music event (starts after 8pm) and lasts long (6 hours or more)
        if (isMusic && startHour >= 20) {
          const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
          isLongNightMusicEvent = durationHours >= 6
        }
      }
      
      return {
        ...event,
        backgroundColor: finalColor,
        borderColor: finalColor,
        textColor: '#ffffff',
        extendedProps: {
          ...event.extendedProps,
          originalEnd,
          isLongNightMusicEvent,
        },
      }
    })
  }, [events])

  // Adjust events for month/week views - cap long night music events to same day
  const adjustedEvents = useMemo(() => {
    const isMonthOrWeek = calendarView === 'dayGridMonth' || calendarView === 'timeGridWeek'
    
    if (!isMonthOrWeek) {
      // In day/list views, use original end times
      return eventsWithColors
    }
    
    // In month/week views, cap long night music events
    return eventsWithColors.map((event: any) => {
      if (event.extendedProps?.isLongNightMusicEvent && event.end) {
        const startDate = new Date(event.start)
        const endDate = new Date(event.end)
        const startDay = startDate.toISOString().split('T')[0]
        const endDay = endDate.toISOString().split('T')[0]
        
        // If event spans to next day, cap it to 11:59pm on start day
        if (startDay !== endDay) {
          const sameDayEnd = new Date(startDate)
          sameDayEnd.setHours(23, 59, 59, 999)
          return {
            ...event,
            end: sameDayEnd.toISOString(),
          }
        }
      }
      return event
    })
  }, [eventsWithColors, calendarView])

  // Filter events with debounced search
  const filteredEvents = useMemo(
    () => {
      let filtered = filterEvents(adjustedEvents, {
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
    [adjustedEvents, debouncedSearchQuery, selectedTags, selectedCategories, freeOnly, excludeExhibitions, excludeContinuous]
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

  // FullCalendar handlers
  const handleViewChange = (view: any) => {
    setCalendarView(view.view.type)
  }

  const handleDateChange = (dateInfo: any) => {
    const date = dateInfo.view.calendar.getDate()
    setDateFocus(date.toISOString().split('T')[0])
  }

  // Saved views handlers
  const handleSaveView = async () => {
    const name = prompt('Enter a name for this view:')
    if (!name || !name.trim()) return
    
    const currentState: ViewState = {
      viewMode: calendarView,
      dateFocus,
      searchQuery,
      selectedCategories,
      selectedTags,
      toggles: {
        freeOnly,
        excludeExhibitions,
        excludeContinuous,
      },
    }
    
    // Save to DB if logged in, else localStorage
    if (session?.user) {
      const dbView = await saveViewToDB(name.trim(), currentState)
      if (dbView) {
        await loadSavedViews()
        setShowSavedViewsMenu(false)
        return
      }
    }
    
    // Fallback to localStorage
    const saved = saveView(name.trim(), currentState)
    setSavedViews(getSavedViews())
    setShowSavedViewsMenu(false)
  }

  const handleLoadView = (view: SavedView) => {
    const merged = mergeViewState(view.state)
    setSearchQuery(merged.searchQuery)
    setSelectedCategories(merged.selectedCategories)
    setSelectedTags(merged.selectedTags)
    setFreeOnly(merged.toggles.freeOnly)
    setExcludeExhibitions(merged.toggles.excludeExhibitions)
    setExcludeContinuous(merged.toggles.excludeContinuous)
    setCalendarView(merged.viewMode)
    setDateFocus(merged.dateFocus)
    
    // Navigate calendar to date
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi()
      calendarApi.gotoDate(merged.dateFocus)
      calendarApi.changeView(merged.viewMode)
    }
    
    setShowSavedViewsMenu(false)
  }

  const handleDeleteView = (id: string) => {
    if (confirm('Delete this saved view?')) {
      deleteView(id)
      setSavedViews(getSavedViews())
    }
  }

  const handleSetDefault = (id: string) => {
    setViewAsDefault(id)
    setSavedViews(getSavedViews())
  }

  const handleResetToDefault = () => {
    const defaultView = getDefaultView()
    if (defaultView) {
      handleLoadView(defaultView)
    } else {
      // Reset to default state
      setSearchQuery(DEFAULT_VIEW_STATE.searchQuery)
      setSelectedCategories(DEFAULT_VIEW_STATE.selectedCategories)
      setSelectedTags(DEFAULT_VIEW_STATE.selectedTags)
      setFreeOnly(DEFAULT_VIEW_STATE.toggles.freeOnly)
      setExcludeExhibitions(DEFAULT_VIEW_STATE.toggles.excludeExhibitions)
      setExcludeContinuous(DEFAULT_VIEW_STATE.toggles.excludeContinuous)
      setCalendarView(DEFAULT_VIEW_STATE.viewMode)
      setDateFocus(DEFAULT_VIEW_STATE.dateFocus)
      
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi()
        calendarApi.gotoDate(DEFAULT_VIEW_STATE.dateFocus)
        calendarApi.changeView(DEFAULT_VIEW_STATE.viewMode)
      }
    }
  }

  const handleStartRename = (view: SavedView) => {
    setEditingViewId(view.id)
    setEditingViewName(view.name)
  }

  const handleSaveRename = () => {
    if (!editingViewId || !editingViewName.trim()) {
      setEditingViewId(null)
      setEditingViewName('')
      return
    }
    
    updateView(editingViewId, { name: editingViewName.trim() })
    setSavedViews(getSavedViews())
    setEditingViewId(null)
    setEditingViewName('')
  }

  const handleCancelRename = () => {
    setEditingViewId(null)
    setEditingViewName('')
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
    <div className="min-h-screen bg-white/95 backdrop-blur-sm">

      <div className="flex flex-col md:flex-row">
        {/* Left Sidebar */}
        <div className="w-full md:w-72 border-r-0 md:border-r border-b md:border-b-0 border-gray-200/50 p-4 md:p-6 bg-white/60 backdrop-blur-sm max-h-[50vh] md:max-h-none md:min-h-[calc(100vh-120px)] overflow-y-auto">
          {/* Search Bar */}
          <div className="mb-4 md:mb-6">
            <div className="text-xs md:text-sm font-semibold mb-2 md:mb-3 text-gray-800">Search Events</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border border-gray-300/50 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-sm"
              />
              <button
                onClick={handleClearFilters}
                className="px-3 md:px-4 py-2 md:py-2.5 border border-gray-300/50 rounded-lg hover:bg-gray-100/80 text-xs md:text-sm whitespace-nowrap font-medium text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow"
                disabled={activeFiltersCount === 0}
              >
                Clear
              </button>
            </div>
            {!loading && (
              <div className="text-xs text-gray-500 mt-2 font-medium">
                {filteredEvents.length} of {events.length} events
                {activeFiltersCount > 0 && ` (${activeFiltersCount} filter${activeFiltersCount > 1 ? 's' : ''} active)`}
              </div>
            )}
          </div>

          <div className="mb-4 md:mb-6">
            <div className="text-xs md:text-sm font-semibold mb-2 md:mb-3 text-gray-800">Filters</div>
            <div className="space-y-2.5">
              <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-100/50 transition-colors">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={(e) => setFreeOnly(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/50 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs md:text-sm text-gray-700 group-hover:text-gray-900">Free events only</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-100/50 transition-colors">
                <input
                  type="checkbox"
                  checked={excludeExhibitions}
                  onChange={(e) => setExcludeExhibitions(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/50 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs md:text-sm text-gray-700 group-hover:text-gray-900">Exclude exhibitions</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-100/50 transition-colors">
                <input
                  type="checkbox"
                  checked={excludeContinuous}
                  onChange={(e) => setExcludeContinuous(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/50 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs md:text-sm text-gray-700 group-hover:text-gray-900">Exclude continuous events</span>
              </label>
            </div>
          </div>

          {allCategories.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold mb-3 text-gray-800">
                Category
                {selectedCategories.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    ({selectedCategories.length} selected)
                  </span>
                )}
              </div>
              
              {/* All Categories Button */}
              <div className="mb-3">
                <button
                  onClick={() => setSelectedCategories([])}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all shadow-sm hover:shadow ${
                    selectedCategories.length === 0
                      ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                      : 'bg-white/80 border-gray-300/50 hover:bg-gray-50 text-gray-700 hover:border-gray-400'
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
                      className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        isSelected
                          ? 'text-white shadow-md hover:shadow-lg scale-105'
                          : 'text-gray-700 hover:opacity-90 hover:scale-105 bg-white/80'
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
                  <div className="mb-3">
                    <div className="text-xs text-gray-600 mb-2 font-medium">Popular tags:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.slice(0, 8).map((tag) => {
                        const isSelected = selectedTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            onClick={() => handleTagToggle(tag)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-all shadow-sm hover:shadow ${
                              isSelected
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white border-transparent shadow-md hover:shadow-lg scale-105'
                                : 'bg-white/80 border-gray-300/50 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
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
                    className="w-full border border-gray-300/50 rounded-lg px-3 py-2 text-sm bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-sm"
                  />
                
                {/* Dropdown */}
                {tagSearchQuery.trim() && (
                  <div className="absolute z-10 w-full mt-1 bg-white/95 backdrop-blur-md border border-gray-300/50 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {filteredTags.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">No tags match your search</div>
                    ) : (
                      filteredTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag)
                        return (
                          <label
                            key={tag}
                            className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-100/80 transition-colors ${
                              isSelected ? 'bg-blue-50/80' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleTagToggle(tag)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/50 w-4 h-4 cursor-pointer"
                            />
                            <span className="text-sm flex-1 text-gray-700">{tag}</span>
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
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50/50 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}
                </div>
              </>
            )}
          </div>

          {/* Saved Views */}
          <div className="mb-4 border-t border-gray-200/50 pt-4">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <div className="text-xs md:text-sm font-semibold text-gray-800">Saved Views</div>
              <button
                onClick={() => setShowSavedViewsMenu(!showSavedViewsMenu)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50/50 transition-colors"
              >
                {showSavedViewsMenu ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {showSavedViewsMenu && (
              <div className="space-y-2">
                <button
                  onClick={handleSaveView}
                  className="w-full px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm border-2 border-gray-300/50 rounded-lg hover:bg-gray-50/80 font-medium text-gray-700 transition-all shadow-sm hover:shadow"
                >
                  Save Current View
                </button>
                
                {savedViews.length > 0 && (
                  <>
                    <div className="text-xs text-gray-600 mb-1">Saved:</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {savedViews.map((view) => (
                        <div
                          key={view.id}
                          className="flex items-center gap-1 p-2 border border-gray-200 rounded hover:bg-gray-50"
                        >
                          {editingViewId === view.id ? (
                            <div className="flex-1 flex items-center gap-1">
                              <input
                                type="text"
                                value={editingViewName}
                                onChange={(e) => setEditingViewName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename()
                                  if (e.key === 'Escape') handleCancelRename()
                                }}
                                className="flex-1 px-2 py-1 text-xs border rounded"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveRename}
                                className="text-xs text-green-600 hover:underline"
                              >
                                ✓
                              </button>
                              <button
                                onClick={handleCancelRename}
                                className="text-xs text-red-600 hover:underline"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleLoadView(view)}
                                className="flex-1 text-left text-xs text-blue-600 hover:text-blue-700 font-medium truncate hover:underline transition-colors"
                              >
                                {view.name}
                                {view.isDefault && (
                                  <span className="ml-1 text-gray-500 font-normal">(default)</span>
                                )}
                              </button>
                              <button
                                onClick={() => handleStartRename(view)}
                                className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors"
                                title="Rename"
                              >
                                ✎
                              </button>
                              <button
                                onClick={() => handleSetDefault(view.id)}
                                className="text-xs text-gray-500 hover:text-yellow-600 px-1.5 py-1 rounded hover:bg-yellow-50 transition-colors"
                                title="Set as default"
                              >
                                ⭐
                              </button>
                              <button
                                onClick={() => handleDeleteView(view.id)}
                                className="text-xs text-red-500 hover:text-red-700 px-1.5 py-1 rounded hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleResetToDefault}
                      className="w-full px-4 py-2.5 text-xs border-2 border-gray-300/50 rounded-lg hover:bg-gray-50/80 text-gray-700 font-medium transition-all shadow-sm hover:shadow"
                    >
                      Reset to Default View
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Calendar Area */}
        <div className="flex-1 p-4 md:p-6">
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
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
              initialView={calendarView}
              initialDate={dateFocus}
              datesSet={handleDateChange}
              viewDidMount={handleViewChange}
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
              // Prevent long events from spanning multiple days in month/week views
              eventMaxStack={10}
              moreLinkClick="popover"
            />
          )}
        </div>
      </div>

      {/* Event Modal */}
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
