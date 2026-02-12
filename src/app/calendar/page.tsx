'use client'

import { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import {
  fetchEvents,
  fetchVenues,
  filterEvents,
  getAllTags,
  getAllCategories,
  toCanonicalTagKey,
  type NormalizedEvent,
  type VenueOption,
  type VenueForDisplay,
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
  personaRulesToViewState,
  type PersonaRulesInput,
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
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import EventCardsSlider from '@/components/EventCardsSlider'
import MobileDaySliders from '@/components/MobileDaySliders'
import NearMeSlider from '@/components/NearMeSlider'
import EventModal from './components/EventModal'
import EventListView from './components/EventListView'

function ListToolbar({
  calendarView,
  dateFocus,
  onDateChange,
  showListView,
  onShowListViewChange,
}: {
  calendarView: ViewState['viewMode']
  dateFocus: string
  onDateChange: (d: string) => void
  showListView: boolean
  onShowListViewChange: (v: boolean) => void
}) {
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
    const d = new Date(dateFocus)
    if (calendarView === 'dayGridMonth') d.setMonth(d.getMonth() - 1)
    else if (calendarView === 'timeGridWeek') d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 1)
    onDateChange(d.toISOString().split('T')[0])
  }
  const goNext = () => {
    const d = new Date(dateFocus)
    if (calendarView === 'dayGridMonth') d.setMonth(d.getMonth() + 1)
    else if (calendarView === 'timeGridWeek') d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + 1)
    onDateChange(d.toISOString().split('T')[0])
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/60 rounded-xl border border-slate-700/50 px-4 py-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0 bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
          <button
            onClick={() => onShowListViewChange(false)}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white transition-all"
          >
            Calendar
          </button>
          <button
            onClick={() => onShowListViewChange(true)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
          >
            List
          </button>
        </div>
        <div className="flex items-center gap-1">
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
      </div>
      <button
        onClick={() => onDateChange(new Date().toISOString().split('T')[0])}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors"
      >
        Today
      </button>
    </div>
  )
}

function CalendarPageContent() {
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [venuesWithCoords, setVenuesWithCoords] = useState<VenueForDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [tagSearchQuery, setTagSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedVenues, setSelectedVenues] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [freeOnly, setFreeOnly] = useState(false)
  const [excludeExhibitions, setExcludeExhibitions] = useState(false)
  const [excludeContinuous, setExcludeContinuous] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)
  
  // View state
  const [calendarView, setCalendarView] = useState<ViewState['viewMode']>('dayGridMonth')
  const [dateFocus, setDateFocus] = useState<string>(DEFAULT_VIEW_STATE.dateFocus)
  const [showListView, setShowListView] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [showSavedViewsMenu, setShowSavedViewsMenu] = useState(false)
  const [editingViewId, setEditingViewId] = useState<string | null>(null)
  const [editingViewName, setEditingViewName] = useState('')
  const [sharedContext, setSharedContext] = useState<{ slug: string; by?: string; name?: string; type: 'view' | 'persona' } | null>(null)
  const [personas, setPersonas] = useState<{ id: string; title: string; rules_json: string }[]>([])
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null)
  // Initialize sidebar as minimized on mobile, open on desktop
  const [sidebarMinimized, setSidebarMinimized] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 // md breakpoint
    }
    return false
  })
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const calendarRef = useRef<FullCalendar>(null)
  const { data: session } = useSession()

  // Debounce search for performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Handle window resize to update sidebar state on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && !sidebarMinimized) {
        // On mobile, minimize sidebar if it's open
        setSidebarMinimized(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [sidebarMinimized])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [fetchedEvents, fetchedVenues] = await Promise.all([
          fetchEvents(),
          fetchVenues(),
        ])
        if (fetchedEvents.length === 0) {
          console.warn('No events found. Check CSV URL and data structure.')
        }
        setEvents(fetchedEvents)
        setVenuesWithCoords(fetchedVenues)
        // Use CSV venues for filter when available; map to VenueOption { key, name }
        const venueOptions: VenueOption[] = fetchedVenues.length > 0
          ? fetchedVenues
              .map((v) => ({ key: v.venue_id || v.slug, name: v.name }))
              .sort((a, b) => a.name.localeCompare(b.name))
          : []
        setVenues(venueOptions)
      } catch (error) {
        console.error('Error loading data:', error)
        setEvents([])
        setVenues([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Hydrate shared context from URL
  useEffect(() => {
    const slug = searchParams.get('sharedSlug')
    const by = searchParams.get('sharedBy') || undefined
    const name = searchParams.get('sharedName') || undefined
    const type = searchParams.get('sharedType')
    if (slug && (type === 'view' || type === 'persona')) {
      setSharedContext({ slug, by, name, type: type as 'view' | 'persona' })
    } else {
      setSharedContext(null)
    }
  }, [searchParams])

  // Load personas when PERSONAS flag is on
  useEffect(() => {
    if (!FEATURE_FLAGS.PERSONAS || !session?.user) return
    fetch('/api/personas')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data?.personas && setPersonas(data.personas))
      .catch(() => {})
  }, [session?.user])

  // Hydrate from URL on mount and load saved views
  useEffect(() => {
    const urlState = deserializeViewStateFromURL(searchParams)
    if (Object.keys(urlState).length > 0) {
      const merged = mergeViewState(urlState)
      setSearchQuery(merged.searchQuery)
      setSelectedCategories(merged.selectedCategories)
      setSelectedTags(merged.selectedTags)
      setSelectedVenues(merged.selectedVenues)
      setFreeOnly(merged.toggles.freeOnly)
      setExcludeExhibitions(merged.toggles.excludeExhibitions)
      // Only update excludeContinuous if it's explicitly in the URL state
      if (urlState.toggles?.excludeContinuous !== undefined) {
        setExcludeContinuous(merged.toggles.excludeContinuous)
      }
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
        setSelectedVenues(merged.selectedVenues)
        setFreeOnly(merged.toggles.freeOnly)
        setExcludeExhibitions(merged.toggles.excludeExhibitions)
        // Only update excludeContinuous if it's explicitly in the saved view state
        if (defaultView.state.toggles?.excludeContinuous !== undefined) {
          setExcludeContinuous(merged.toggles.excludeContinuous)
        }
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

  // Sync to URL (debounced), preserving shared context params
  useEffect(() => {
    const currentState: ViewState = {
      viewMode: calendarView,
      dateFocus,
      searchQuery,
      selectedCategories,
      selectedTags,
      selectedVenues,
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
    
    // Add view state params
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    
    // Preserve shared context params
    const sharedSlug = searchParams.get('sharedSlug')
    const sharedBy = searchParams.get('sharedBy')
    const sharedType = searchParams.get('sharedType')
    const sharedName = searchParams.get('sharedName')
    if (sharedSlug) url.searchParams.set('sharedSlug', sharedSlug)
    if (sharedBy) url.searchParams.set('sharedBy', sharedBy)
    if (sharedType) url.searchParams.set('sharedType', sharedType)
    if (sharedName) url.searchParams.set('sharedName', sharedName)
    
    // Update URL without page reload (debounced)
    const timeoutId = setTimeout(() => {
      router.replace(url.pathname + url.search, { scroll: false })
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }, [calendarView, dateFocus, searchQuery, selectedCategories, selectedTags, selectedVenues, freeOnly, excludeExhibitions, excludeContinuous, router, searchParams])

  // Memoize all tags, categories, and venues (strictly CSV venues only, no canonical fallback)
  const allTags = useMemo(() => getAllTags(events), [events])
  const allCategories = useMemo(() => getAllCategories(events), [events])
  const allVenues = useMemo(() => venues, [venues])

  // Last updated = max last_seen_at among loaded events (trust/freshness cue)
  const lastUpdated = useMemo(() => {
    if (!events.length) return null
    const max = events.reduce<string | null>((m, e) => {
      const t = e.extendedProps?.lastSeenAt
      if (!t) return m
      return !m || t > m ? t : m
    }, null)
    return max
  }, [events])

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
        selectedVenues: selectedVenues.length > 0 ? selectedVenues : undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        freeOnly,
      })
      
      // Exclude exhibitions
      if (excludeExhibitions) {
        filtered = filtered.filter((event) => {
          const category = event.extendedProps.category?.toLowerCase()
          const tags = event.extendedProps.tags.map((t) => t.toLowerCase())
          return category !== 'arts' && !tags.some((t) => toCanonicalTagKey(t) === 'exhibition')
        })
      }
      
      // Exclude continuous events (multi-day exhibitions with opensAt that span multiple days)
      if (excludeContinuous) {
        filtered = filtered.filter((event) => {
          if (!event.extendedProps?.opensAt || !event.end) return true
          const start = new Date(event.start)
          const end = new Date(event.end)
          const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
          return daysDiff <= 1
        })
      }
      
      return filtered
    },
    [adjustedEvents, debouncedSearchQuery, selectedTags, selectedVenues, selectedCategories, freeOnly, excludeExhibitions, excludeContinuous]
  )

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleVenueToggle = (venueKey: string) => {
    setSelectedVenues((prev) =>
      prev.includes(venueKey) ? prev.filter((k) => k !== venueKey) : [...prev, venueKey]
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
    setSelectedVenues([])
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
    // Only update if it's a valid calendar view (not listWeek, which is now a toggle)
    if (view.view.type !== 'listWeek') {
      setCalendarView(view.view.type)
    }
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
      selectedVenues,
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
    setSelectedVenues(merged.selectedVenues)
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
      setSelectedVenues(DEFAULT_VIEW_STATE.selectedVenues)
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

  const handleApplyPersona = (persona: { id: string; title: string; rules_json: string }) => {
    const rules: PersonaRulesInput = typeof persona.rules_json === 'string'
      ? JSON.parse(persona.rules_json) : persona.rules_json
    const partial = personaRulesToViewState(rules)
    const merged = mergeViewState(partial)
    setSelectedTags(merged.selectedTags)
    setSelectedCategories(merged.selectedCategories)
    setSelectedVenues(merged.selectedVenues)
    setFreeOnly(merged.toggles.freeOnly)
    setActivePersonaId(persona.id)
  }

  const handleClearPersona = () => {
    setActivePersonaId(null)
  }

  const handleDismissSharedBanner = () => {
    setSharedContext(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('sharedSlug')
    url.searchParams.delete('sharedBy')
    url.searchParams.delete('sharedType')
    url.searchParams.delete('sharedName')
    router.replace(url.pathname + url.search, { scroll: false })
  }

  const handleCreatePersona = async () => {
    const title = prompt('Enter a name for this persona:')
    if (!title || !title.trim()) return
    const rules: PersonaRulesInput = {
      includeTags: selectedTags.length ? selectedTags : undefined,
      includeCategories: selectedCategories.length ? selectedCategories : undefined,
      includeVenues: selectedVenues.length ? selectedVenues : undefined,
      freeOnly: freeOnly || undefined,
    }
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), rules }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create persona')
      }
      const { persona } = await res.json()
      setPersonas((prev) => [...prev, { id: persona.id, title: persona.title, rules_json: persona.rules_json }])
      setActivePersonaId(persona.id)
    } catch (e) {
      console.error('Create persona error:', e)
      alert(e instanceof Error ? e.message : 'Failed to create persona')
    }
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
    if (selectedVenues.length > 0) count++
    if (selectedCategories.length > 0) count++
    if (freeOnly) count++
    if (excludeExhibitions) count++
    if (excludeContinuous) count++
    return count
  }, [debouncedSearchQuery, selectedTags.length, selectedVenues.length, selectedCategories.length, freeOnly, excludeExhibitions, excludeContinuous])

  return (
    <div className="min-h-screen bg-slate-900/95 backdrop-blur-sm">

      {/* Shared view/persona banner */}
      {FEATURE_FLAGS.SHARED_VIEWS && sharedContext && (
        <div className="bg-indigo-900/40 border-b border-indigo-700/50 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-200">
            {sharedContext.type === 'view' ? 'View' : 'Persona'}{' '}
            {sharedContext.name && `"${sharedContext.name}"`}
            {sharedContext.by && ` by @${sharedContext.by}`}
          </span>
          <div className="flex items-center gap-2">
            {session?.user && (
              <button
                onClick={handleSaveView}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Save a copy
              </button>
            )}
            <button
              onClick={handleDismissSharedBanner}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row">
        {/* Left Sidebar */}
        <div className={`relative transition-all duration-300 ${sidebarMinimized ? 'w-0 md:w-12' : 'w-full md:w-72'} border-r-0 md:border-r border-b md:border-b-0 border-slate-700/50 bg-slate-800/60 backdrop-blur-xl ${sidebarMinimized ? 'overflow-visible md:overflow-visible' : 'p-3 md:p-6 max-h-[50vh] md:max-h-none md:min-h-[calc(100vh-120px)] overflow-y-auto'} flex-shrink-0 ${!sidebarMinimized ? 'z-50 md:z-auto fixed md:relative inset-y-0 left-0' : ''}`}>

          {/* Minimize/Expand Button - Desktop only */}
          <button
            onClick={() => setSidebarMinimized(!sidebarMinimized)}
            className={`hidden md:flex absolute top-4 ${sidebarMinimized ? 'right-2 md:right-1' : 'right-4'} z-[100] p-2 rounded-lg bg-slate-700/90 hover:bg-slate-600/90 border border-slate-600/50 transition-all shadow-lg hover:shadow-xl items-center justify-center backdrop-blur-sm`}
            aria-label={sidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
          >
            <svg 
              className={`w-5 h-5 text-slate-300 transition-transform ${sidebarMinimized ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Mobile Close Button - Inside sidebar on mobile */}
          {!sidebarMinimized && (
            <button
              onClick={() => setSidebarMinimized(true)}
              className="md:hidden absolute top-4 right-4 z-[100] p-2 rounded-lg bg-slate-700/90 hover:bg-slate-600/90 border border-slate-600/50 transition-all shadow-lg hover:shadow-xl flex items-center justify-center backdrop-blur-sm"
              aria-label="Close filters"
            >
              <svg 
                className="w-5 h-5 text-slate-300" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          
          {!sidebarMinimized && (
            <>
          {/* Search Bar */}
          <div className="mb-4 md:mb-6">
            <div className="text-xs md:text-sm font-semibold mb-2 md:mb-3 text-slate-200">Search Events</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border border-slate-600/50 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm bg-slate-900/80 backdrop-blur-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-lg"
              />
              <button
                onClick={handleClearFilters}
                className="px-3 md:px-4 py-2 md:py-2.5 border border-slate-600/50 rounded-lg hover:bg-slate-700/80 text-xs md:text-sm whitespace-nowrap font-medium text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl bg-slate-800/80"
                disabled={activeFiltersCount === 0}
              >
                Clear
              </button>
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-2 font-medium space-y-1">
                <div>
                  {filteredEvents.length} of {events.length} events
                  {activeFiltersCount > 0 && ` (${activeFiltersCount} filter${activeFiltersCount > 1 ? 's' : ''} active)`}
                </div>
                {lastUpdated && (
                  <div>Last updated: {new Date(lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 md:mb-6">
            <div className="text-xs md:text-sm font-semibold mb-2 md:mb-3 text-slate-200">Filters</div>
            <div className="space-y-2.5">
              <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={(e) => setFreeOnly(e.target.checked)}
                  className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-4 h-4 cursor-pointer bg-slate-900"
                />
                <span className="text-xs md:text-sm text-slate-300 group-hover:text-white">Free events only</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                <input
                  type="checkbox"
                  checked={excludeExhibitions}
                  onChange={(e) => setExcludeExhibitions(e.target.checked)}
                  className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-4 h-4 cursor-pointer bg-slate-900"
                />
                <span className="text-xs md:text-sm text-slate-300 group-hover:text-white">Exclude exhibitions</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                <input
                  type="checkbox"
                  checked={excludeContinuous}
                  onChange={(e) => setExcludeContinuous(e.target.checked)}
                  className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-4 h-4 cursor-pointer bg-slate-900"
                />
                <span className="text-xs md:text-sm text-slate-300 group-hover:text-white">Exclude continuous events</span>
              </label>
            </div>
          </div>

          {allCategories.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold mb-3 text-slate-200">
                Category
                {selectedCategories.length > 0 && (
                  <span className="ml-2 text-xs text-slate-400 font-normal">
                    ({selectedCategories.length} selected)
                  </span>
                )}
              </div>
              
              {/* All Categories Button */}
              <div className="mb-3">
                <button
                  onClick={() => setSelectedCategories([])}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all shadow-lg hover:shadow-xl ${
                    selectedCategories.length === 0
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-xl'
                      : 'bg-slate-800/80 border-slate-600/50 hover:bg-slate-700/80 text-slate-300 hover:border-slate-500'
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
                          ? 'text-white shadow-xl hover:shadow-2xl scale-105'
                          : 'hover:opacity-90 hover:scale-105 bg-slate-800/80 text-slate-300'
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

          {allVenues.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold mb-2 text-slate-200">
                Venue / Location ({allVenues.length} total)
                {selectedVenues.length > 0 && (
                  <span className="ml-2 text-xs text-slate-400">
                    ({selectedVenues.length} selected)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {allVenues.map((venue) => {
                  const isSelected = selectedVenues.includes(venue.key)
                  return (
                    <button
                      key={venue.key}
                      onClick={() => handleVenueToggle(venue.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        isSelected
                          ? 'bg-emerald-600/90 text-white border-emerald-500'
                          : 'bg-slate-800/80 border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:border-slate-500'
                      }`}
                      title={venue.name}
                    >
                      <span className="line-clamp-1 max-w-[140px] md:max-w-[180px]">{venue.name}</span>
                    </button>
                  )
                })}
              </div>
              {selectedVenues.length > 0 && (
                <button
                  onClick={() => setSelectedVenues([])}
                  className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Clear venues
                </button>
              )}
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2 text-slate-200">
              Filter by Tags ({allTags.length} total)
              {selectedTags.length > 0 && (
                <span className="ml-2 text-xs text-slate-400">
                  ({selectedTags.length} selected)
                </span>
              )}
            </div>
            {loading ? (
              <div className="text-sm text-slate-400">Loading tags...</div>
            ) : allTags.length === 0 ? (
              <div className="text-sm text-slate-400">No tags available</div>
            ) : (
              <>
                {/* Popular Tags Quick Select */}
                {allTags.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-slate-400 mb-2 font-medium">Popular tags:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.slice(0, 8).map((tag) => {
                        const isSelected = selectedTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            onClick={() => handleTagToggle(tag)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-all shadow-lg hover:shadow-xl ${
                              isSelected
                                ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white border-transparent shadow-xl hover:shadow-2xl scale-105'
                                : 'bg-slate-800/80 border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:border-slate-500'
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
                    className="w-full border border-slate-600/50 rounded-lg px-3 py-2 text-sm bg-slate-900/80 backdrop-blur-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-lg"
                  />
                
                {/* Dropdown */}
                {tagSearchQuery.trim() && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                    {filteredTags.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400">No tags match your search</div>
                    ) : (
                      filteredTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag)
                        return (
                          <label
                            key={tag}
                            className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-700/80 transition-colors ${
                              isSelected ? 'bg-indigo-900/50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleTagToggle(tag)}
                              className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-4 h-4 cursor-pointer bg-slate-900"
                            />
                            <span className="text-sm flex-1 text-slate-300">{tag}</span>
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
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-gradient-to-r from-indigo-600/80 to-purple-600/80 text-white border border-indigo-500/50"
                      >
                        {tag}
                        <button
                          onClick={() => handleTagToggle(tag)}
                          className="hover:bg-indigo-500/50 rounded-full p-0.5 transition-colors"
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
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded hover:bg-indigo-900/50 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}
                </div>
              </>
            )}
          </div>

          {/* Personas */}
          {FEATURE_FLAGS.PERSONAS && session?.user && (
            <div className="mb-4 border-t border-slate-700/50 pt-4">
              <div className="text-xs md:text-sm font-semibold text-slate-200 mb-2">Personas</div>
              <button
                onClick={handleCreatePersona}
                className="w-full mb-2 px-3 py-2 text-xs border border-slate-600/50 rounded-lg hover:bg-slate-700/80 font-medium text-slate-300 transition-colors"
              >
                Create persona from current filters
              </button>
              {personas.length > 0 && (
                <>
                  <select
                    value={activePersonaId || ''}
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) {
                        handleClearPersona()
                        return
                      }
                      const p = personas.find((x) => x.id === id)
                      if (p) handleApplyPersona(p)
                    }}
                    className="w-full border border-slate-600/50 rounded-lg px-3 py-2 text-sm bg-slate-900/80 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="">Apply persona...</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                  {activePersonaId && (
                    <button
                      onClick={handleClearPersona}
                      className="mt-1 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Clear persona
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Saved Views */}
          <div className="mb-4 border-t border-slate-700/50 pt-4">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <div className="text-xs md:text-sm font-semibold text-slate-200">Saved Views</div>
              <button
                onClick={() => setShowSavedViewsMenu(!showSavedViewsMenu)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded hover:bg-indigo-900/50 transition-colors"
              >
                {showSavedViewsMenu ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {showSavedViewsMenu && (
              <div className="space-y-2">
                <button
                  onClick={handleSaveView}
                  className="w-full px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm border-2 border-slate-600/50 rounded-lg hover:bg-slate-700/80 font-medium text-slate-300 transition-all shadow-lg hover:shadow-xl bg-slate-800/80"
                >
                  Save Current View
                </button>
                
                {savedViews.length > 0 && (
                  <>
                    <div className="text-xs text-slate-400 mb-1">Saved:</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {savedViews.map((view) => (
                        <div
                          key={view.id}
                          className="flex items-center gap-1 p-2 border border-slate-700/50 rounded hover:bg-slate-700/50 bg-slate-800/50"
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
                                className="flex-1 px-2 py-1 text-xs border border-slate-600 rounded bg-slate-900 text-slate-200"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveRename}
                                className="text-xs text-green-400 hover:text-green-300 hover:underline"
                              >
                                ✓
                              </button>
                              <button
                                onClick={handleCancelRename}
                                className="text-xs text-red-400 hover:text-red-300 hover:underline"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleLoadView(view)}
                                className="flex-1 text-left text-xs text-indigo-400 hover:text-indigo-300 font-medium truncate hover:underline transition-colors"
                              >
                                {view.name}
                                {view.isDefault && (
                                  <span className="ml-1 text-slate-500 font-normal">(default)</span>
                                )}
                              </button>
                              <button
                                onClick={() => handleStartRename(view)}
                                className="text-xs text-slate-400 hover:text-slate-300 px-1.5 py-1 rounded hover:bg-slate-700 transition-colors"
                                title="Rename"
                              >
                                ✎
                              </button>
                              <button
                                onClick={() => handleSetDefault(view.id)}
                                className="text-xs text-slate-400 hover:text-yellow-400 px-1.5 py-1 rounded hover:bg-yellow-900/30 transition-colors"
                                title="Set as default"
                              >
                                ⭐
                              </button>
                              <button
                                onClick={() => handleDeleteView(view.id)}
                                className="text-xs text-red-400 hover:text-red-300 px-1.5 py-1 rounded hover:bg-red-900/30 transition-colors"
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
                      className="w-full px-4 py-2.5 text-xs border-2 border-slate-600/50 rounded-lg hover:bg-slate-700/80 text-slate-300 font-medium transition-all shadow-lg hover:shadow-xl bg-slate-800/80"
                    >
                      Reset to Default View
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
            </>
          )}
        </div>

        {/* Main Calendar Area */}
        <div className="flex-1 p-4 md:p-6 min-w-0">
          {/* Mobile: Show Day Sliders or List View */}
          <div className="md:hidden">
            {/* Mobile View Toggle - List / This week (Slider) */}
            <div className="mb-4 flex items-center gap-2 bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
              <button
                onClick={() => setShowListView(true)}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  showListView
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setShowListView(false)}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  !showListView
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                This week
              </button>
            </div>

            {/* Mobile Filter Icon Button - Above first slider */}
            {sidebarMinimized && !showListView && (
              <button
                onClick={() => setSidebarMinimized(false)}
                className="mb-4 p-3 rounded-lg bg-slate-700/90 hover:bg-slate-600/90 border border-slate-600/50 transition-all shadow-lg hover:shadow-xl flex items-center justify-center backdrop-blur-sm"
                aria-label="Open filters"
              >
                <svg 
                  className="w-5 h-5 text-slate-300" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
            )}
            
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <div className="text-slate-400">Loading events...</div>
              </div>
            ) : showListView ? (
              <div className="pt-2">
                <EventListView
                  events={filteredEvents}
                  calendarView={calendarView}
                  dateFocus={dateFocus}
                  onDateChange={setDateFocus}
                  onEventClick={(info: any) => {
                    // For mobile list view, info might be the event directly or a FullCalendar event object
                    const event = info.event ? filteredEvents.find((e) => e.id === info.event.id) : info
                    if (event) {
                      setSelectedEvent(event)
                    }
                  }}
                />
              </div>
            ) : (
              <>
                <MobileDaySliders
                  events={events}
                  onEventClick={setSelectedEvent}
                  selectedCategories={selectedCategories}
                  selectedTags={selectedTags}
                  freeOnly={freeOnly}
                  excludeExhibitions={excludeExhibitions}
                  excludeContinuous={excludeContinuous}
                  onCategoriesChange={setSelectedCategories}
                  onTagsChange={setSelectedTags}
                />
                {!loading && filteredEvents.length > 0 && (
                  <NearMeSlider events={filteredEvents} venuesWithCoords={venuesWithCoords} onEventClick={setSelectedEvent} />
                )}
              </>
            )}
          </div>

          {/* Desktop: Calendar View */}
          <div className="hidden md:block">
              {/* Desktop: Event Cards Slider - Above Calendar (only show when not in list view) */}
              {!showListView && !loading && filteredEvents.length > 0 && (
                <>
                  <div className="w-full mb-6">
                    <EventCardsSlider
                      events={events}
                      onEventClick={setSelectedEvent}
                      selectedCategories={selectedCategories}
                      selectedTags={selectedTags}
                      freeOnly={freeOnly}
                      excludeExhibitions={excludeExhibitions}
                      excludeContinuous={excludeContinuous}
                      onCategoriesChange={setSelectedCategories}
                      onTagsChange={setSelectedTags}
                      mode="slider"
                      dateFocus={dateFocus}
                    />
                  </div>
                  <NearMeSlider events={filteredEvents} venuesWithCoords={venuesWithCoords} onEventClick={setSelectedEvent} />
                </>
              )}

              {loading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-slate-400">Loading events...</div>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <div className="text-slate-400 text-lg mb-2">No events found</div>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={handleClearFilters}
                        className="text-indigo-400 hover:text-indigo-300 hover:underline text-sm"
                      >
                        Clear filters to see all events
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* Calendar/List Toggle - Desktop: fixed when calendar view, inline with date nav when list view */}
                  {!showListView && (
                    <div className="fixed top-2 right-[200px] z-50 hidden md:block">
                      <div className="flex items-center gap-2 bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
                        <button
                          onClick={() => setShowListView(false)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                        >
                          Calendar
                        </button>
                        <button
                          onClick={() => setShowListView(true)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white transition-all"
                        >
                          List
                        </button>
                      </div>
                    </div>
                  )}
                  {showListView ? (
                    <div className="mb-4">
                      <ListToolbar
                        calendarView={calendarView}
                        dateFocus={dateFocus}
                        onDateChange={setDateFocus}
                        showListView={showListView}
                        onShowListViewChange={setShowListView}
                      />
                      <EventListView
                        events={filteredEvents}
                        calendarView={calendarView}
                        dateFocus={dateFocus}
                        onDateChange={setDateFocus}
                        onEventClick={handleEventClick}
                        hideDateNav
                      />
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
                  right: 'dayGridMonth,timeGridWeek,timeGridDay',
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
              )}
          </div>
        </div>
      </div>

      {/* Event Modal */}
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900/95 backdrop-blur-sm flex items-center justify-center">
        <div className="text-slate-400">Loading calendar...</div>
      </div>
    }>
      <CalendarPageContent />
    </Suspense>
  )
}
