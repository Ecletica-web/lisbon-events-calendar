import { normalizeCategory, normalizeCategories } from '@/lib/categoryNormalization'
import { CANONICAL_VENUES, venueNameToSlug, normalizeHandle } from '@/data/canonicalVenues'
import {
  loadEvents,
  filterEventsForListing,
} from '@/data/loaders/eventsLoader'
import type { Event } from '@/models/Event'

/** Legacy RawEvent kept for type compatibility; actual parsing is in eventsLoader */
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
  venue_id?: string
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

    // Venue (venueId primary; venueKey for dedupe & cap)
    venueId?: string
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

    // Status (scheduled, postponed, sold_out, etc.)
    status?: string

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

const IMAGE_PROXY = 'https://images.weserv.nl/?url='
const MAX_EVENTS_PER_VENUE = 15

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
 * Convert Event domain object to FullCalendar NormalizedEvent
 */
function eventToNormalizedEvent(e: Event): NormalizedEvent {
  // Venue key: prefer venue_id, else canonical match, else fallback key
  const canonicalKey = matchEventToCanonicalVenue(e.venue_name, e.source_name)
  const fallbackKey = toCanonicalVenueKey(e.venue_name, e.venue_address)
  const venueKey = e.venue_id || canonicalKey || fallbackKey || undefined

  const startDate = new Date(e.start_datetime)
  let opensAt: string | undefined
  if (startDate.getUTCHours() !== 0 || startDate.getUTCMinutes() !== 0) {
    opensAt = `${String(startDate.getUTCHours()).padStart(2, '0')}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`
  }

  return {
    id: e.event_id,
    title: e.title,
    start: e.start_datetime,
    end: e.end_datetime,
    allDay: false,
    extendedProps: {
      descriptionShort: e.description_short,
      descriptionLong: e.description_long,
      venueId: e.venue_id,
      venueName: e.venue_name,
      venueAddress: e.venue_address,
      venueKey,
      neighborhood: e.neighborhood,
      city: e.city,
      latitude: e.latitude,
      longitude: e.longitude,
      tags: e.tags,
      category: e.category,
      priceMin: e.price_min,
      priceMax: e.price_max,
      currency: e.currency,
      isFree: e.is_free,
      ageRestriction: e.age_restriction,
      language: e.language,
      ticketUrl: e.ticket_url,
      imageUrl: sanitizeImageUrl(e.primary_image_url),
      status: e.status,
      sourceName: e.source_name,
      sourceUrl: e.source_url,
      sourceEventId: e.source_event_id,
      confidenceScore: e.confidence_score,
      timezone: e.timezone,
      opensAt,
      lastSeenAt: e.last_seen_at,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      dedupeKey: e.dedupe_key,
    },
  }
}

/**
 * Fetch events from Google Sheets CSV.
 * Uses new loader; filters to scheduled, sold_out, postponed; dedupes; caps per venue.
 */
export async function fetchEvents(): Promise<NormalizedEvent[]> {
  const csvUrl = process.env.NEXT_PUBLIC_EVENTS_CSV_URL

  if (!csvUrl) {
    console.warn('NEXT_PUBLIC_EVENTS_CSV_URL is not set. Please check your .env.local file.')
    return []
  }

  try {
    const { events: domainEvents, quarantined } = await loadEvents(csvUrl)
    if (quarantined.length > 0) {
      console.warn(`[eventsAdapter] Quarantined ${quarantined.length} bad rows`)
    }

    const listingEvents = filterEventsForListing(domainEvents)
    const normalized = listingEvents.map(eventToNormalizedEvent)

    const capped = capEventsPerVenue(normalized, MAX_EVENTS_PER_VENUE)
    return capped.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  } catch (error) {
    console.error('Error fetching events:', error)
    return []
  }
}

/**
 * Fetch all events (including cancelled/archived) for detail pages.
 * Draft events are still excluded.
 */
export async function fetchAllEventsForDetail(): Promise<NormalizedEvent[]> {
  const csvUrl = process.env.NEXT_PUBLIC_EVENTS_CSV_URL
  if (!csvUrl) return []

  const { events } = await loadEvents(csvUrl)
  const visible = events.filter((e) => e.status !== 'draft')
  return visible.map(eventToNormalizedEvent).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

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
    /** Optional: filter to events in this collection (event IDs from collection_items) */
    collectionEventIds?: Set<string>
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
    collectionEventIds,
  } = options

  if (collectionEventIds && collectionEventIds.size > 0) {
    filtered = filtered.filter((e) => collectionEventIds.has(e.id))
  }

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
  // Matches venueKey (canonical or venue_id) or venueId
  if (selectedVenues.length > 0) {
    filtered = filtered.filter((event) => {
      const eventVenueKey = event.extendedProps.venueKey || event.extendedProps.venueId || toCanonicalVenueKey(event.extendedProps.venueName, event.extendedProps.venueAddress)
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
