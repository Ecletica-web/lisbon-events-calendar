import Papa from 'papaparse'
import { normalizeCategory, normalizeCategories } from '@/lib/categoryNormalization'
import { CANONICAL_VENUES, venueNameToSlug, normalizeHandle } from '@/data/canonicalVenues'

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
  opens_at?: string
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
    
    // Venue (venueKey = canonical key for dedupe & cap per location)
    venueName?: string
    venueAddress?: string
    venueKey?: string
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
    opensAt?: string
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
                // Skip rows without required fields (event_id, title, start_datetime)
                return !!(row.event_id && row.title && row.start_datetime)
              })
              .map((row) => normalizeEvent(row))
              .filter((event) => {
                // Only show active events
                return event !== null
              })
              .filter((event): event is NormalizedEvent => event !== null)
            
            console.log(`Normalized ${normalized.length} events from ${results.data.length} rows`)
            
            // Deduplicate by dedupe_key, event_id, then title+start+venue
            const deduped = deduplicateEvents(normalized)
            console.log(`After deduplication: ${deduped.length} events`)

            // Cap per venue so one location doesn't dominate
            const capped = capEventsPerVenue(deduped, MAX_EVENTS_PER_VENUE)
            if (capped.length < deduped.length) {
              console.log(`After cap per venue (max ${MAX_EVENTS_PER_VENUE}): ${capped.length} events`)
            }

            resolve(capped)
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
 * Parse opening time from description (e.g. "14:00-20:00", "opens 14:00", "daily 14:00")
 * Returns "HH:MM" or null
 */
function parseOpeningTimeFromDescription(desc: string | undefined): string | null {
  if (!desc) return null
  const text = desc.toLowerCase()
  // Match "14:00-20:00", "14:00 - 20:00", "14:00–20:00" (first time is opening)
  const rangeMatch = text.match(/\b(\d{1,2}):(\d{2})\s*[-–]\s*\d{1,2}:\d{2}\b/)
  if (rangeMatch) return `${rangeMatch[1].padStart(2, '0')}:${rangeMatch[2]}`
  // Match "opens at 14:00", "opens 14:00", "open 14:00", "daily 14:00"
  const opensMatch = text.match(/(?:opens?\s+(?:at\s+)?|daily\s+)(\d{1,2}):(\d{2})\b/)
  if (opensMatch) return `${opensMatch[1].padStart(2, '0')}:${opensMatch[2]}`
  // Match standalone "14:00" or "14h"
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (timeMatch) return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
  const hourMatch = text.match(/\b(\d{1,2})h\b/)
  if (hourMatch) return `${hourMatch[1].padStart(2, '0')}:00`
  return null
}

const IMAGE_PROXY = 'https://images.weserv.nl/?url='

/** Max events to show per venue (cap so one location doesn't dominate) */
const MAX_EVENTS_PER_VENUE = 15

/**
 * Match event to canonical venue by venue_name or source_name (handle). Returns canonical key or undefined.
 * Normalises so RŪMU / Rumu match rumu.club (accents removed, prefix match: "rumu" -> "rumuclub").
 */
function matchEventToCanonicalVenue(venueName?: string, sourceName?: string): string | undefined {
  const nameSlug = venueNameToSlug(venueName || '')
  const handleNorm = normalizeHandle(sourceName || '')
  const handleNoDots = handleNorm.replace(/\./g, '')
  if (!nameSlug && !handleNorm) return undefined
  for (const v of CANONICAL_VENUES) {
    if (nameSlug && v.key === nameSlug) return v.key
    if (nameSlug && nameSlug.length >= 3 && v.key.startsWith(nameSlug)) return v.key // Rumu / RŪMU -> rumu.club
    if (handleNorm && normalizeHandle(v.handle) === handleNorm) return v.key
    const vHandleNoDots = normalizeHandle(v.handle).replace(/\./g, '')
    if (handleNoDots && handleNoDots.length >= 3 && (vHandleNoDots === handleNoDots || vHandleNoDots.startsWith(handleNoDots) || handleNoDots.startsWith(vHandleNoDots))) return v.key
    if (venueName && venueNameToSlug(v.name) === nameSlug) return v.key
  }
  return undefined
}

/**
 * Canonical key for venue/location - fallback when not in canonical list (normalizes names for dedupe and grouping)
 */
function toCanonicalVenueKey(venueName?: string, venueAddress?: string): string {
  const name = (venueName || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const addr = (venueAddress || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!name && !addr) return ''
  if (!name) return addr || ''
  if (!addr) return name
  return `${name}|${addr}`
}

/**
 * Use fallback for placeholder; proxy Instagram CDN URLs so they load (they block direct embedding)
 */
function sanitizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (lower.includes('images.example.com')) return undefined
  if (lower.includes('cdninstagram') || lower.includes('fbcdn.net')) {
    return IMAGE_PROXY + encodeURIComponent(url)
  }
  return url
}

/**
 * Normalize a raw event to FullCalendar format
 */
function normalizeEvent(row: RawEvent): NormalizedEvent | null {
  // Filter out inactive events - accept 'active', 'scheduled', and 'needs_review'
  const status = row.status?.toLowerCase()
  if (status && status !== 'active' && status !== 'scheduled' && status !== 'needs_review') {
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

  // Normalize all-day flag - we never use allDay for display; events show at opening time
  const wasAllDay = normalizeBoolean(row.is_all_day, false)

  // For all-day events: get opening time and convert to time-bounded (no full-day slot)
  let opensAt: string | undefined
  if (wasAllDay) {
    const start = new Date(startDate)
    const startHour = start.getUTCHours()
    const startMin = start.getUTCMinutes()
    const isMidnight = startHour === 0 && startMin === 0

    if (isMidnight) {
      // Try opens_at column (e.g. "14:00", "14"), then parse description
      const sheetOpens = row.opens_at?.trim()
      let parsed: string | null = null
      if (sheetOpens) {
        const m = sheetOpens.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/)
        if (m) parsed = `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`
      }
      if (!parsed) parsed = parseOpeningTimeFromDescription(row.description_short || row.description_long)
      const [openH, openM] = (parsed || '10:00').split(':').map(Number)
      opensAt = `${String(openH).padStart(2, '0')}:${String(openM || 0).padStart(2, '0')}`
      // Adjust start to opening time on start date
      const startOnly = new Date(start)
      startOnly.setUTCHours(openH, openM || 0, 0, 0)
      startDate = startOnly.toISOString()
      // If we have end, keep it; else end 1h after start for calendar display
      if (!endDate) {
        const endOnly = new Date(startOnly)
        endOnly.setUTCHours(endOnly.getUTCHours() + 1, 0, 0, 0)
        endDate = endOnly.toISOString()
      }
    } else {
      // Start already has a time - use it as opens
      opensAt = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`
    }
  }

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
    allDay: false,
    extendedProps: {
      descriptionShort: row.description_short?.trim() || undefined,
      descriptionLong: row.description_long?.trim() || undefined,
      venueName: row.venue_name?.trim() || undefined,
      venueAddress: row.venue_address?.trim() || undefined,
      venueKey: matchEventToCanonicalVenue(row.venue_name?.trim(), row.source_name?.trim()) || toCanonicalVenueKey(row.venue_name?.trim(), row.venue_address?.trim()) || undefined,
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
      imageUrl: sanitizeImageUrl(row.image_url?.trim()),
      sourceName: row.source_name?.trim() || undefined,
      sourceUrl: row.source_url?.trim() || undefined,
      sourceEventId: row.source_event_id?.trim() || undefined,
      confidenceScore: confidenceScore || undefined,
      timezone,
      opensAt,
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

    // Priority 3: title + start + venue key (fallback) - same event at same location
    const venueKey = event.extendedProps.venueKey || event.extendedProps.venueName?.toLowerCase().trim() || ''
    const fallbackKey = `${event.title}|${event.start}|${venueKey}`
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
 * Cap events per venue so one location doesn't dominate (keeps soonest by start date)
 */
function capEventsPerVenue(events: NormalizedEvent[], maxPerVenue: number): NormalizedEvent[] {
  if (maxPerVenue <= 0) return events
  const byVenue = new Map<string, NormalizedEvent[]>()
  for (const event of events) {
    const key = event.extendedProps.venueKey || event.extendedProps.venueName?.toLowerCase().trim() || `_no_venue_${event.id}`
    if (!byVenue.has(key)) byVenue.set(key, [])
    byVenue.get(key)!.push(event)
  }
  const out: NormalizedEvent[] = []
  for (const [, venueEvents] of byVenue) {
    const sorted = venueEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    out.push(...sorted.slice(0, maxPerVenue))
  }
  return out.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
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
    selectedVenues?: string[]
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
    selectedVenues = [],
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

  // Tag filtering (OR logic - event must have ANY of the selected tags)
  // Uses canonical matching so "visual art" matches events with "visual-art"
  if (selectedTags.length > 0) {
    filtered = filtered.filter((event) => {
      return selectedTags.some((selectedTag) =>
        event.extendedProps.tags.some((eventTag) => tagsMatch(eventTag, selectedTag))
      )
    })
  }

  // Venue/location filtering (OR logic - event must be at ANY of the selected venues)
  if (selectedVenues.length > 0) {
    filtered = filtered.filter((event) => {
      const eventVenueKey = event.extendedProps.venueKey || toCanonicalVenueKey(event.extendedProps.venueName, event.extendedProps.venueAddress)
      return eventVenueKey && selectedVenues.includes(eventVenueKey)
    })
  }

  // Category filter (support both single and multiple categories)
  // Normalize categories to handle duplicates like "art" and "arts"
  if (categories && categories.length > 0) {
    // Multiple categories - OR logic (event matches ANY selected category)
    const normalizedSelected = categories.map(c => normalizeCategory(c))
    filtered = filtered.filter((event) => {
      if (!event.extendedProps.category) return false
      const normalizedEventCategory = normalizeCategory(event.extendedProps.category)
      return normalizedSelected.some(
        (selectedCategory) =>
          normalizedEventCategory === selectedCategory
      )
    })
  } else if (category) {
    // Single category (backward compatibility)
    const normalizedSelected = normalizeCategory(category)
    filtered = filtered.filter((event) => {
      if (!event.extendedProps.category) return false
      const normalizedEventCategory = normalizeCategory(event.extendedProps.category)
      return normalizedEventCategory === normalizedSelected
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
 * Canonical key for tag deduplication - groups variants like "visual-art", "visual art", "visualart"
 * Exported for use in filters (e.g. excludeExhibitions)
 */
export function toCanonicalTagKey(tag: string): string {
  if (!tag || typeof tag !== 'string') return ''
  let key = tag.toLowerCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  // Simple plural merge: "concerts" -> "concert", "exhibitions" -> "exhibition"
  if (key.length > 4 && key.endsWith('s') && !key.endsWith('ss')) {
    key = key.slice(0, -1)
  }
  return key
}

/**
 * Deduplicate tags by merging variants (hyphen/space, plural/singular)
 * Returns a smaller list for display, using the shortest form as representative
 */
function deduplicateTags(tags: string[]): string[] {
  const byCanonical = new Map<string, string>()
  for (const tag of tags) {
    const key = toCanonicalTagKey(tag)
    if (!key) continue
    const existing = byCanonical.get(key)
    // Prefer shorter form (e.g. "concert" over "concerts"), then form without hyphens
    if (!existing || tag.length < existing.length || (tag.length === existing.length && !tag.includes('-') && existing.includes('-'))) {
      byCanonical.set(key, tag)
    }
  }
  return Array.from(byCanonical.values()).sort()
}

/**
 * Check if an event tag matches a selected (display) tag (handles variants)
 */
function tagsMatch(eventTag: string, selectedTag: string): boolean {
  if (eventTag === selectedTag) return true
  return toCanonicalTagKey(eventTag) === toCanonicalTagKey(selectedTag)
}

/**
 * Get all unique tags from events, deduplicated for redundancy
 */
export function getAllTags(events: NormalizedEvent[]): string[] {
  const tagSet = new Set<string>()
  events.forEach((event) => {
    event.extendedProps.tags.forEach((tag) => tagSet.add(tag))
  })
  return deduplicateTags(Array.from(tagSet))
}

/**
 * Get all unique categories from events (normalized to prevent duplicates)
 */
export function getAllCategories(events: NormalizedEvent[]): string[] {
  const categorySet = new Set<string>()
  events.forEach((event) => {
    if (event.extendedProps.category) {
      categorySet.add(event.extendedProps.category)
    }
  })
  // Normalize categories to merge duplicates like "art" and "arts"
  return normalizeCategories(Array.from(categorySet))
}

/**
 * Venue entry for filter UI (key = canonical key, name = display name)
 */
export interface VenueOption {
  key: string
  name: string
}

/**
 * Get all venues from the canonical list (full list so filter always shows rumu, etc.).
 * Selecting a venue with no matching events just shows 0 events.
 */
export function getAllVenues(_events?: NormalizedEvent[]): VenueOption[] {
  return CANONICAL_VENUES.map((v) => ({ key: v.key, name: v.name })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Public helper to get canonical venue key (for filtering) */
export function toCanonicalVenueKeyPublic(venueName?: string, venueAddress?: string): string {
  return toCanonicalVenueKey(venueName, venueAddress)
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
