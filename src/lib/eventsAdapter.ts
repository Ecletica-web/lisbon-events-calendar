import Papa from 'papaparse'

/**
 * Raw event schema from data source
 */
export interface RawEvent {
  event_id: string
  title: string
  description_short?: string
  description_long?: string
  start_datetime: string
  end_datetime?: string
  timezone?: string
  is_all_day?: string | boolean
  venue_name?: string
  venue_address?: string
  neighborhood?: string
  city?: string
  latitude?: string | number
  longitude?: string | number
  tags?: string | string[]
  category?: string
  price_min?: string | number
  price_max?: string | number
  currency?: string
  is_free?: string | boolean
  age_restriction?: string
  language?: string
  ticket_url?: string
  image_url?: string
  status?: string
  recurrence_rule?: string
  source_name?: string
  source_url?: string
  source_event_id?: string
  dedupe_key?: string
  confidence_score?: string | number
  last_seen_at?: string
  created_at?: string
  updated_at?: string
}

/**
 * Normalized event for FullCalendar
 */
export interface NormalizedEvent {
  id: string
  title: string
  start: string
  end?: string
  allDay?: boolean
  extendedProps: {
    // Descriptions
    descriptionShort?: string
    descriptionLong?: string
    
    // Venue
    venueName?: string
    venueAddress?: string
    neighborhood?: string
    city?: string
    
    // Geo
    latitude?: number
    longitude?: number
    
    // Tags & Category
    tags: string[]
    category?: string
    
    // Pricing
    priceMin?: number
    priceMax?: number
    currency?: string
    isFree?: boolean
    
    // Event details
    ageRestriction?: string
    language?: string
    ticketUrl?: string
    imageUrl?: string
    
    // Source
    sourceName?: string
    sourceUrl?: string
    sourceEventId?: string
    confidenceScore?: number
    
    // Metadata
    timezone?: string
    recurrenceRule?: string
    lastSeenAt?: string
    createdAt?: string
    updatedAt?: string
    dedupeKey?: string
  }
}

/**
 * Fetch events from Google Sheets CSV
 */
export async function fetchEvents(): Promise<NormalizedEvent[]> {
  // Use window.location to get env var in client-side
  const csvUrl = typeof window !== 'undefined' 
    ? process.env.NEXT_PUBLIC_EVENTS_CSV_URL
    : process.env.NEXT_PUBLIC_EVENTS_CSV_URL

  if (!csvUrl) {
    console.error('NEXT_PUBLIC_EVENTS_CSV_URL is not set. Please check your .env.local file.')
    return []
  }

  console.log('Fetching events from:', csvUrl)

  try {
    const response = await fetch(csvUrl, { cache: 'no-store' })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.statusText}`)
    }

    const csvText = await response.text()
    
    return new Promise((resolve, reject) => {
      Papa.parse<RawEvent>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            // Log CSV structure for debugging
            if (results.data.length > 0) {
              console.log('CSV columns found:', Object.keys(results.data[0]))
              console.log('Total rows:', results.data.length)
            }

            const normalized = results.data
              .filter((row) => {
                // Required fields check
                const hasRequired = row.event_id && row.title && row.start_datetime
                if (!hasRequired && results.data.length > 0) {
                  console.warn('Row missing required fields:', {
                    event_id: row.event_id,
                    title: row.title,
                    start_datetime: row.start_datetime,
                    availableKeys: Object.keys(row),
                  })
                }
                return hasRequired
              })
              .map((row) => normalizeEvent(row))
              .filter((event) => {
                // Only show active events
                return event !== null
              })
              .filter((event): event is NormalizedEvent => event !== null)
            
            console.log(`Normalized ${normalized.length} events from ${results.data.length} rows`)
            
            // Deduplicate
            const deduped = deduplicateEvents(normalized)
            
            console.log(`After deduplication: ${deduped.length} events`)
            
            resolve(deduped)
          } catch (error) {
            console.error('Error processing CSV data:', error)
            reject(error)
          }
        },
        error: (error: Error) => {
          console.error('PapaParse error:', error)
          reject(error)
        },
      })
    })
  } catch (error) {
    console.error('Error fetching events:', error)
    return []
  }
}

/**
 * Normalize a raw event to FullCalendar format
 */
function normalizeEvent(row: RawEvent): NormalizedEvent | null {
  // Filter out inactive events - accept both 'active' and 'scheduled'
  const status = row.status?.toLowerCase()
  if (status && status !== 'active' && status !== 'scheduled') {
    return null
  }

  // Normalize timezone
  const timezone = row.timezone?.trim() || 'Europe/Lisbon'

  // Normalize dates
  let startDate: string
  let endDate: string | undefined

  try {
    // Ensure start_datetime is valid
    const start = new Date(row.start_datetime)
    if (isNaN(start.getTime())) {
      console.warn(`Invalid start_datetime for event ${row.event_id}: ${row.start_datetime}`)
      return null
    }
    startDate = start.toISOString()

    if (row.end_datetime) {
      const end = new Date(row.end_datetime)
      if (!isNaN(end.getTime())) {
        endDate = end.toISOString()
      }
    }
  } catch (error) {
    console.warn(`Date parsing error for event ${row.event_id}:`, error)
    return null
  }

  // Normalize all-day flag
  const allDay = normalizeBoolean(row.is_all_day, false)

  // Normalize tags
  const tags = normalizeTags(row.tags)

  // Normalize category
  const category = row.category?.trim().toLowerCase() || undefined

  // Normalize prices
  const priceMin = normalizeNumber(row.price_min)
  const priceMax = normalizeNumber(row.price_max)
  const currency = row.currency?.trim().toUpperCase() || undefined

  // Normalize is_free
  let isFree = normalizeBoolean(row.is_free, false)
  // Infer free if prices are null/zero
  if (!isFree && priceMin === null && priceMax === null) {
    // Don't guess - leave as false if not explicitly set
  }

  // Normalize geo coordinates
  const latitude = normalizeNumber(row.latitude)
  const longitude = normalizeNumber(row.longitude)

  // Normalize confidence score
  const confidenceScore = normalizeNumber(row.confidence_score)

  return {
    id: row.event_id,
    title: row.title,
    start: startDate,
    end: endDate,
    allDay: allDay || undefined,
    extendedProps: {
      descriptionShort: row.description_short?.trim() || undefined,
      descriptionLong: row.description_long?.trim() || undefined,
      venueName: row.venue_name?.trim() || undefined,
      venueAddress: row.venue_address?.trim() || undefined,
      neighborhood: row.neighborhood?.trim() || undefined,
      city: row.city?.trim() || undefined,
      latitude: latitude || undefined,
      longitude: longitude || undefined,
      tags,
      category,
      priceMin: priceMin || undefined,
      priceMax: priceMax || undefined,
      currency,
      isFree,
      ageRestriction: row.age_restriction?.trim() || undefined,
      language: row.language?.trim() || undefined,
      ticketUrl: row.ticket_url?.trim() || undefined,
      imageUrl: row.image_url?.trim() || undefined,
      sourceName: row.source_name?.trim() || undefined,
      sourceUrl: row.source_url?.trim() || undefined,
      sourceEventId: row.source_event_id?.trim() || undefined,
      confidenceScore: confidenceScore || undefined,
      timezone,
      recurrenceRule: row.recurrence_rule?.trim() || undefined,
      lastSeenAt: row.last_seen_at?.trim() || undefined,
      createdAt: row.created_at?.trim() || undefined,
      updatedAt: row.updated_at?.trim() || undefined,
      dedupeKey: row.dedupe_key?.trim() || undefined,
    },
  }
}

/**
 * Normalize tags from string or array to string[]
 */
function normalizeTags(tags?: string | string[]): string[] {
  if (!tags) return []

  if (Array.isArray(tags)) {
    return tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  }

  // Comma-separated string
  return tags
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
}

/**
 * Normalize boolean from string or boolean
 */
function normalizeBoolean(value?: string | boolean, defaultValue: boolean = false): boolean {
  if (value === undefined || value === null) return defaultValue
  if (typeof value === 'boolean') return value
  const str = String(value).trim().toLowerCase()
  return str === 'true' || str === '1' || str === 'yes'
}

/**
 * Normalize number from string or number
 */
function normalizeNumber(value?: string | number): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    return isNaN(value) ? null : value
  }
  const parsed = parseFloat(String(value).trim())
  return isNaN(parsed) ? null : parsed
}

/**
 * Deduplicate events using priority rules
 */
function deduplicateEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const dedupeMap = new Map<string, NormalizedEvent>()
  const eventIdMap = new Map<string, NormalizedEvent>()
  const fallbackMap = new Map<string, NormalizedEvent>()

  for (const event of events) {
    // Priority 1: dedupe_key from raw data
    const dedupeKey = event.extendedProps.dedupeKey
    
    if (dedupeKey) {
      const existing = dedupeMap.get(dedupeKey)
      if (!existing || shouldKeepNewer(event, existing)) {
        dedupeMap.set(dedupeKey, event)
      }
      continue
    }

    // Priority 2: event_id
    const existingById = eventIdMap.get(event.id)
    if (!existingById || shouldKeepNewer(event, existingById)) {
      eventIdMap.set(event.id, event)
    }

    // Priority 3: title + start + venue (fallback)
    const fallbackKey = `${event.title}|${event.start}|${event.extendedProps.venueName || ''}`
    const existingFallback = fallbackMap.get(fallbackKey)
    if (!existingFallback || shouldKeepNewer(event, existingFallback)) {
      fallbackMap.set(fallbackKey, event)
    }
  }

  // Merge results, prioritizing dedupe_key > event_id > fallback
  const result = new Map<string, NormalizedEvent>()

  // Add dedupe_key events
  for (const event of dedupeMap.values()) {
    result.set(event.id, event)
  }

  // Add event_id events (if not already added)
  for (const event of eventIdMap.values()) {
    if (!result.has(event.id)) {
      result.set(event.id, event)
    }
  }

  // Add fallback events (if not already added)
  for (const event of fallbackMap.values()) {
    if (!result.has(event.id)) {
      result.set(event.id, event)
    }
  }

  return Array.from(result.values())
}

/**
 * Determine if new event should replace existing based on updated_at
 */
function shouldKeepNewer(newEvent: NormalizedEvent, existing: NormalizedEvent): boolean {
  const newUpdated = newEvent.extendedProps.updatedAt
  const existingUpdated = existing.extendedProps.updatedAt

  if (!newUpdated) return false
  if (!existingUpdated) return true

  try {
    return new Date(newUpdated) > new Date(existingUpdated)
  } catch {
    return false
  }
}

/**
 * Filter events by search query, tags, category, and other filters
 */
export function filterEvents(
  events: NormalizedEvent[],
  options: {
    searchQuery?: string
    selectedTags?: string[]
    category?: string
    categories?: string[]
    freeOnly?: boolean
    language?: string
    ageRestriction?: string
  }
): NormalizedEvent[] {
  let filtered = events

  const {
    searchQuery = '',
    selectedTags = [],
    category,
    categories,
    freeOnly = false,
    language,
    ageRestriction,
  } = options

  // Text search (title, venue, tags, category)
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim()
    filtered = filtered.filter((event) => {
      const titleMatch = event.title.toLowerCase().includes(query)
      const venueMatch = event.extendedProps.venueName?.toLowerCase().includes(query)
      const tagsMatch = event.extendedProps.tags.some((tag) =>
        tag.includes(query)
      )
      const categoryMatch = event.extendedProps.category?.includes(query)
      return titleMatch || venueMatch || tagsMatch || categoryMatch
    })
  }

  // Tag filtering (AND logic - event must have ALL selected tags)
  if (selectedTags.length > 0) {
    filtered = filtered.filter((event) => {
      return selectedTags.every((selectedTag) =>
        event.extendedProps.tags.includes(selectedTag)
      )
    })
  }

  // Category filter (support both single and multiple categories)
  if (categories && categories.length > 0) {
    // Multiple categories - OR logic (event matches ANY selected category)
    filtered = filtered.filter((event) => {
      if (!event.extendedProps.category) return false
      return categories.some(
        (selectedCategory) =>
          event.extendedProps.category?.toLowerCase() === selectedCategory.toLowerCase()
      )
    })
  } else if (category) {
    // Single category (backward compatibility)
    filtered = filtered.filter((event) => {
      return event.extendedProps.category?.toLowerCase() === category.toLowerCase()
    })
  }

  // Free events only
  if (freeOnly) {
    filtered = filtered.filter((event) => {
      return event.extendedProps.isFree === true
    })
  }

  // Language filter
  if (language) {
    filtered = filtered.filter((event) => {
      return event.extendedProps.language?.toLowerCase() === language.toLowerCase()
    })
  }

  // Age restriction filter
  if (ageRestriction) {
    filtered = filtered.filter((event) => {
      return event.extendedProps.ageRestriction?.toLowerCase() === ageRestriction.toLowerCase()
    })
  }

  return filtered
}

/**
 * Get all unique tags from events
 */
export function getAllTags(events: NormalizedEvent[]): string[] {
  const tagSet = new Set<string>()
  events.forEach((event) => {
    event.extendedProps.tags.forEach((tag) => tagSet.add(tag))
  })
  return Array.from(tagSet).sort()
}

/**
 * Get all unique categories from events
 */
export function getAllCategories(events: NormalizedEvent[]): string[] {
  const categorySet = new Set<string>()
  events.forEach((event) => {
    if (event.extendedProps.category) {
      categorySet.add(event.extendedProps.category)
    }
  })
  return Array.from(categorySet).sort()
}

/**
 * Get all unique languages from events
 */
export function getAllLanguages(events: NormalizedEvent[]): string[] {
  const languageSet = new Set<string>()
  events.forEach((event) => {
    if (event.extendedProps.language) {
      languageSet.add(event.extendedProps.language)
    }
  })
  return Array.from(languageSet).sort()
}
