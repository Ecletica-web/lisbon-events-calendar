import { unstable_cache } from 'next/cache'
import { normalizeCategory, normalizeCategories } from '@/lib/categoryNormalization'
import { CANONICAL_VENUES, venueNameToSlug, normalizeHandle } from '@/data/canonicalVenues'
import {
  loadEvents,
  filterEventsForListing,
} from '@/data/loaders/eventsLoader'
import { loadVenues } from '@/data/loaders/venuesLoader'
import { loadEventTags } from '@/data/loaders/eventTagsLoader'
import { loadVenueTags } from '@/data/loaders/venueTagsLoader'
import { loadPromoters } from '@/data/loaders/promotersLoader'
import { buildVenueIndex } from '@/data/venueIndex'
import { loadVenueProfileImageMap, mergeVenueProfileImages } from '@/lib/venueProfileImages'
import type { Venue } from '@/models/Venue'
import type { Promoter } from '@/models/Promoter'
import type { Event } from '@/models/Event'

function normKey(s: string | undefined): string {
  return (s || '').toLowerCase().trim()
}

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
export interface NightAct {
  id: string
  title: string
  start: string
  end?: string
  imageUrl?: string
  sourceUrl?: string
  ticketUrl?: string
  promoterId?: string
  promoterName?: string
  descriptionShort?: string
}

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
    /** All distinct flyer images from collapsed same-venue same-day acts. */
    imageUrls?: string[]
    /** How many original posts were collapsed into this night entry. */
    sameVenueDayCount?: number
    /** Individual acts when this card is a collapsed venue night. */
    nightActs?: NightAct[]
    /** Original event ids folded into this night (includes primary). */
    mergedEventIds?: string[]
    /** All promoter ids/names across acts (for filter / follow reasons). */
    promoterIds?: string[]

    // Status (scheduled, postponed, sold_out, etc.)
    status?: string

    // Source
    sourceName?: string
    sourceUrl?: string
    sourceEventId?: string
    confidenceScore?: number
    promoterId?: string
    promoterName?: string

    // Venue & promoter social links (enriched)
    venueInstagram?: string
    venueWebsite?: string
    promoterInstagram?: string
    promoterWebsite?: string

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
/** Min events at same venue on same day before we treat them as one night / share images. */
const MIN_SAME_VENUE_DAY_EVENTS = 2

function sanitizeImageUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined
  const trimmed = url.trim()
  if (!trimmed) return undefined
  const lower = trimmed.toLowerCase()
  // Block known bad/unresolvable placeholder domains
  if (
    lower.includes('images.example.com') ||
    lower.includes('images.placeholder.com') ||
    lower.includes('images.test')
  )
    return undefined
  // Relative paths without protocol become invalid when used as img src in some contexts
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  if (!/^https?:\/\//i.test(trimmed)) return undefined
  if (lower.includes('cdninstagram') || lower.includes('fbcdn.net')) {
    return IMAGE_PROXY + encodeURIComponent(trimmed)
  }
  return trimmed
}

/**
 * Convert Event domain object to FullCalendar NormalizedEvent
 */
function eventToNormalizedEvent(e: Event): NormalizedEvent {
  const displayVenueName = e.venue_name ?? e.venue_name_raw
  const canonicalKey = matchEventToCanonicalVenue(displayVenueName, e.source_name)
  const fallbackKey = toCanonicalVenueKey(displayVenueName, e.venue_address)
  const venueKey = e.venue_id && e.venue_id !== 'unknown' ? e.venue_id : canonicalKey || fallbackKey || undefined

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
      venueId: e.venue_id !== 'unknown' ? e.venue_id : undefined,
      venueName: displayVenueName,
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
      promoterId: e.promoter_id,
      promoterName: e.promoter_name,
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
 * Enrich events with venue and promoter social links
 */
function enrichEventsWithVenuePromoterLinks(
  events: NormalizedEvent[],
  venues: Venue[],
  promoters: Promoter[]
): NormalizedEvent[] {
  const venueByKey = new Map<string, Venue>()
  for (const v of venues) {
    venueByKey.set(normKey(v.venue_id), v)
    venueByKey.set(normKey(v.slug), v)
    venueByKey.set(normKey(v.name), v)
  }
  const promoterByKey = new Map<string, Promoter>()
  for (const p of promoters) {
    promoterByKey.set(normKey(p.promoter_id), p)
    promoterByKey.set(normKey(p.slug), p)
    promoterByKey.set(normKey(p.name), p)
  }

  return events.map((ev) => {
    const p = ev.extendedProps
    const venue = venueByKey.get(normKey(p.venueId || ''))
      || venueByKey.get(normKey(p.venueKey || ''))
      || venueByKey.get(normKey((p.venueName || '').toLowerCase().replace(/\s+/g, '-')))
    const promoter = promoterByKey.get(normKey(p.promoterId || ''))
      || promoterByKey.get(normKey(p.promoterName || ''))
    if (!venue && !promoter) return ev
    return {
      ...ev,
      extendedProps: {
        ...p,
        venueInstagram: venue?.instagram_handle ?? p.venueInstagram,
        venueWebsite: venue?.website_url ?? venue?.venue_url ?? p.venueWebsite,
        promoterInstagram: promoter?.instagram_handle ?? p.promoterInstagram,
        promoterWebsite: promoter?.website_url ?? p.promoterWebsite,
      },
    }
  })
}

/** Calendar day (YYYY-MM-DD) in the event timezone — used to cluster a venue night. */
function toVenueDayKey(isoStart: string, timeZone?: string): string {
  const tz = timeZone || 'Europe/Lisbon'
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(isoStart))
  } catch {
    return isoStart.slice(0, 10)
  }
}

function sameVenueNightKey(event: NormalizedEvent): string | null {
  const venue =
    event.extendedProps.venueKey ||
    event.extendedProps.venueId ||
    event.extendedProps.venueName?.toLowerCase().trim()
  if (!venue) return null
  const day = toVenueDayKey(event.start, event.extendedProps.timezone)
  return `${normKey(venue)}|${day}`
}

/**
 * When several events share a venue + calendar day, collapse them into one night entry
 * with pooled flyers and a lineup of the original acts.
 */
export function collapseSameVenueDayEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const byNight = new Map<string, NormalizedEvent[]>()
  const ungrouped: NormalizedEvent[] = []

  for (const event of events) {
    const key = sameVenueNightKey(event)
    if (!key) {
      ungrouped.push(event)
      continue
    }
    if (!byNight.has(key)) byNight.set(key, [])
    byNight.get(key)!.push(event)
  }

  const out: NormalizedEvent[] = [...ungrouped]

  for (const [nightKey, group] of byNight) {
    if (group.length < MIN_SAME_VENUE_DAY_EVENTS) {
      out.push(...group)
      continue
    }
    out.push(mergeVenueNight(nightKey, group))
  }

  return out
}

function mergeVenueNight(nightKey: string, group: NormalizedEvent[]): NormalizedEvent {
  const sorted = [...group].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )
  const primary = pickNightPrimary(sorted)
  const venueName = primary.extendedProps.venueName

  const actTitles: string[] = []
  const titleSeen = new Set<string>()
  for (const ev of sorted) {
    const t = ev.title.trim()
    const k = t.toLowerCase()
    if (!t || titleSeen.has(k)) continue
    titleSeen.add(k)
    actTitles.push(t)
  }

  const imageUrls: string[] = []
  const imageSeen = new Set<string>()
  for (const ev of sorted) {
    const url = ev.extendedProps.imageUrl
    if (url && !imageSeen.has(url)) {
      imageSeen.add(url)
      imageUrls.push(url)
    }
  }

  const nightActs: NightAct[] = sorted.map((ev) => ({
    id: ev.id,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    imageUrl: ev.extendedProps.imageUrl,
    sourceUrl: ev.extendedProps.sourceUrl,
    ticketUrl: ev.extendedProps.ticketUrl,
    promoterId: ev.extendedProps.promoterId,
    promoterName: ev.extendedProps.promoterName,
    descriptionShort: ev.extendedProps.descriptionShort,
  }))

  const tags = Array.from(
    new Set(sorted.flatMap((ev) => ev.extendedProps.tags || []))
  )
  const promoterIds = Array.from(
    new Set(
      sorted
        .map((ev) => ev.extendedProps.promoterId || ev.extendedProps.promoterName)
        .filter((x): x is string => Boolean(x))
    )
  )

  const priceMins = sorted
    .map((ev) => ev.extendedProps.priceMin)
    .filter((n): n is number => n != null)
  const priceMaxes = sorted
    .map((ev) => ev.extendedProps.priceMax ?? ev.extendedProps.priceMin)
    .filter((n): n is number => n != null)

  const ends = sorted
    .map((ev) => ev.end)
    .filter((x): x is string => Boolean(x))
    .sort()
  const latestEnd = ends.length > 0 ? ends[ends.length - 1] : primary.end

  const ticketUrl =
    sorted.map((ev) => ev.extendedProps.ticketUrl).find(Boolean) ||
    primary.extendedProps.ticketUrl

  const lineupShort =
    actTitles.length > 0 ? `Lineup: ${actTitles.join(' · ')}` : undefined
  const lineupLong = sorted
    .map((ev) => {
      const bit = ev.extendedProps.descriptionShort?.trim()
      return bit ? `• ${ev.title} — ${bit}` : `• ${ev.title}`
    })
    .join('\n')

  const categoryCounts = new Map<string, number>()
  for (const ev of sorted) {
    const c = ev.extendedProps.category
    if (!c) continue
    categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1)
  }
  let category = primary.extendedProps.category
  let bestCat = 0
  for (const [c, n] of categoryCounts) {
    if (n > bestCat) {
      bestCat = n
      category = c
    }
  }

  return {
    id: `night:${nightKey}`,
    title: buildNightTitle(venueName, actTitles),
    start: sorted[0].start,
    end: latestEnd,
    allDay: false,
    extendedProps: {
      ...primary.extendedProps,
      descriptionShort: lineupShort || primary.extendedProps.descriptionShort,
      descriptionLong: lineupLong || primary.extendedProps.descriptionLong,
      tags,
      category,
      priceMin: priceMins.length ? Math.min(...priceMins) : primary.extendedProps.priceMin,
      priceMax: priceMaxes.length ? Math.max(...priceMaxes) : primary.extendedProps.priceMax,
      isFree: sorted.every((ev) => ev.extendedProps.isFree),
      ticketUrl,
      imageUrl: imageUrls[0] ?? primary.extendedProps.imageUrl,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      sameVenueDayCount: group.length,
      nightActs,
      mergedEventIds: sorted.map((ev) => ev.id),
      promoterIds,
      promoterId: primary.extendedProps.promoterId || promoterIds[0],
      promoterName: primary.extendedProps.promoterName,
      opensAt: sorted[0].extendedProps.opensAt ?? primary.extendedProps.opensAt,
      confidenceScore: Math.max(
        ...sorted.map((ev) => ev.extendedProps.confidenceScore ?? 0)
      ),
    },
  }
}

function pickNightPrimary(sortedByStart: NormalizedEvent[]): NormalizedEvent {
  return sortedByStart.reduce((best, ev) => {
    const score = (e: NormalizedEvent) =>
      (e.extendedProps.imageUrl ? 2 : 0) +
      (e.extendedProps.ticketUrl ? 1 : 0) +
      (e.extendedProps.confidenceScore ?? 0)
    return score(ev) > score(best) ? ev : best
  }, sortedByStart[0])
}

function buildNightTitle(venueName: string | undefined, actTitles: string[]): string {
  const venue = (venueName || '').trim()
  if (actTitles.length === 0) return venue || 'Venue night'
  if (actTitles.length === 1) {
    return venue ? `${venue}: ${actTitles[0]}` : actTitles[0]
  }
  if (actTitles.length === 2) {
    const lineup = actTitles.join(' · ')
    return venue ? `${venue}: ${lineup}` : lineup
  }
  const head = `${actTitles[0]} · ${actTitles[1]} +${actTitles.length - 2}`
  return venue ? `${venue}: ${head}` : head
}

/** @deprecated Use collapseSameVenueDayEvents — kept as alias for any external imports. */
export function enrichSameVenueDayImages(events: NormalizedEvent[]): NormalizedEvent[] {
  return collapseSameVenueDayEvents(events)
}

const EVENTS_CACHE_TAG = 'events'
const EVENTS_REVALIDATE_SECONDS = 300 // 5 min

async function fetchEventsFromSource(): Promise<NormalizedEvent[]> {
  const csvUrl = process.env.NEXT_PUBLIC_EVENTS_CSV_URL
  if (!csvUrl) {
    console.warn('[eventsAdapter] NEXT_PUBLIC_EVENTS_CSV_URL is not set — no events will load. Set it in Vercel env to your published CSV URL.')
    return []
  }
  // Common mistake: using the sheet *edit* URL instead of *publish* URL (File → Share → Publish to web → CSV)
  if (csvUrl.includes('/edit') && !csvUrl.includes('/pub')) {
    console.warn('[eventsAdapter] Events CSV URL looks like an edit link (/edit). Use the published CSV URL: File → Share → Publish to web → choose CSV.')
  }

  const [eventTags, venueTags] = await Promise.all([
    loadEventTags(process.env.NEXT_PUBLIC_EVENT_TAGS_CSV_URL),
    loadVenueTags(process.env.NEXT_PUBLIC_VENUE_TAGS_CSV_URL),
  ])
  const allowedEventTags = eventTags.length > 0 ? eventTags : null
  const allowedVenueTags = venueTags.length > 0 ? venueTags : null
  const { venues } = await loadVenues(process.env.NEXT_PUBLIC_VENUES_CSV_URL, allowedVenueTags)
  const venueIndex = buildVenueIndex(venues)

  let result = await loadEvents(csvUrl, venueIndex, allowedEventTags)

  if (result.events.length === 0) {
    await new Promise((r) => setTimeout(r, 1500))
    result = await loadEvents(csvUrl, venueIndex, allowedEventTags)
  }

  const { events: domainEvents, quarantined, stats } = result
  if (quarantined.length > 0) {
    console.warn(`[eventsAdapter] Quarantined ${quarantined.length} rows:`, stats)
  }

  const listingEvents = filterEventsForListing(domainEvents)
  const normalized = listingEvents.map(eventToNormalizedEvent)
  const promoters = await loadPromoters(process.env.NEXT_PUBLIC_PROMOTERS_CSV_URL)
  const withLinks = enrichEventsWithVenuePromoterLinks(normalized, venues, promoters)
  // Collapse same-venue same-day posts into one night entry (pooled flyers + lineup)
  // before capping, so sibling images/acts aren't lost to the per-venue limit.
  const collapsed = collapseSameVenueDayEvents(withLinks)

  const capped = capEventsPerVenue(collapsed, MAX_EVENTS_PER_VENUE)
  return capped.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

const CLIENT_FETCH_MAX_RETRIES = 2
const CLIENT_FETCH_RETRY_DELAY_MS = 1500

/**
 * Fetch events from Google Sheets CSV.
 * Client-side: fetches from /api/events (avoids CORS) with retries. Server-side: loads from CSV with 5min cache.
 * Does not cache empty responses — refetches when cache would return [].
 */
export async function fetchEvents(): Promise<NormalizedEvent[]> {
  if (typeof window !== 'undefined') {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= CLIENT_FETCH_MAX_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/events')
        if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`)
        const data = await res.json()
        if (Array.isArray(data) && data.length === 0 && attempt < CLIENT_FETCH_MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, CLIENT_FETCH_RETRY_DELAY_MS))
          continue
        }
        return data
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt < CLIENT_FETCH_MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, CLIENT_FETCH_RETRY_DELAY_MS))
        }
      }
    }
    console.error('Error fetching events:', lastError)
    return []
  }

  const cached = await unstable_cache(fetchEventsFromSource, [EVENTS_CACHE_TAG], {
    revalidate: EVENTS_REVALIDATE_SECONDS,
    tags: [EVENTS_CACHE_TAG],
  })()

  if (cached.length === 0) {
    return fetchEventsFromSource()
  }
  return cached
}

/**
 * Fetch all events (including cancelled/archived) for detail pages.
 * Draft events are still excluded.
 */
export async function fetchAllEventsForDetail(): Promise<NormalizedEvent[]> {
  const csvUrl = process.env.NEXT_PUBLIC_EVENTS_CSV_URL
  if (!csvUrl) return []

  const [eventTags, venueTags] = await Promise.all([
    loadEventTags(process.env.NEXT_PUBLIC_EVENT_TAGS_CSV_URL),
    loadVenueTags(process.env.NEXT_PUBLIC_VENUE_TAGS_CSV_URL),
  ])
  const allowedEventTags = eventTags.length > 0 ? eventTags : null
  const allowedVenueTags = venueTags.length > 0 ? venueTags : null
  const { venues } = await loadVenues(process.env.NEXT_PUBLIC_VENUES_CSV_URL, allowedVenueTags)
  const venueIndex = buildVenueIndex(venues)
  const { events } = await loadEvents(csvUrl, venueIndex, allowedEventTags)
  const visible = events.filter((e) => e.status !== 'draft')
  return collapseSameVenueDayEvents(visible.map(eventToNormalizedEvent)).sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )
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
    selectedPromoters?: string[]
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
    selectedPromoters = [],
    category,
    categories,
    freeOnly = false,
    language,
    ageRestriction,
    collectionEventIds,
  } = options

  if (collectionEventIds && collectionEventIds.size > 0) {
    filtered = filtered.filter(
      (e) =>
        collectionEventIds.has(e.id) ||
        e.extendedProps.mergedEventIds?.some((id) => collectionEventIds.has(id))
    )
  }

  // Text search (title, venue, tags, category, lineup acts)
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim()
    filtered = filtered.filter((event) => {
      const titleMatch = event.title.toLowerCase().includes(query)
      const venueMatch = event.extendedProps.venueName?.toLowerCase().includes(query)
      const tagsMatch = event.extendedProps.tags.some((tag) =>
        tag.includes(query)
      )
      const categoryMatch = event.extendedProps.category?.includes(query)
      const actMatch = event.extendedProps.nightActs?.some((a) =>
        a.title.toLowerCase().includes(query)
      )
      return titleMatch || venueMatch || tagsMatch || categoryMatch || actMatch
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

  // Promoter filtering (OR logic) — includes promoters on collapsed night acts
  if (selectedPromoters.length > 0) {
    filtered = filtered.filter((event) => {
      const ids = [
        event.extendedProps.promoterId,
        event.extendedProps.promoterName,
        ...(event.extendedProps.promoterIds || []),
        ...(event.extendedProps.nightActs || []).flatMap((a) =>
          [a.promoterId, a.promoterName].filter(Boolean)
        ),
      ].filter(Boolean) as string[]
      return ids.some((id) => selectedPromoters.includes(id))
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

/** Venue for display (cards, detail page) */
export interface VenueForDisplay {
  venue_id: string
  name: string
  slug: string
  neighborhood?: string
  venue_address?: string
  description_short?: string
  primary_image_url?: string
  website_url?: string
  instagram_handle?: string
  tags: string[]
  latitude?: number
  longitude?: number
}

/**
 * Fetch venues for /venues page and calendar filter.
 * Client (and shared callers) always go through /api/venues (server applies Fontes split).
 */
export async function fetchVenues(): Promise<VenueForDisplay[]> {
  try {
    const res = await fetch('/api/venues')
    if (!res.ok) throw new Error('Failed to fetch venues')
    return res.json()
  } catch (error) {
    console.error('Error fetching venues:', error)
    return []
  }
}

/**
 * Fetch promoters for /promoters page.
 * Always goes through /api/promoters (server applies Fontes split).
 */
export async function fetchPromoters(): Promise<Promoter[]> {
  try {
    const res = await fetch('/api/promoters')
    if (!res.ok) throw new Error('Failed to fetch promoters')
    return res.json()
  } catch (error) {
    console.error('Error fetching promoters:', error)
    return []
  }
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
 * Promoter option for filter UI
 */
export interface PromoterOption {
  id: string
  name: string
}

/**
 * Get unique promoters from events (for filter UI)
 */
export function getAllPromoters(events: NormalizedEvent[]): PromoterOption[] {
  const seen = new Map<string, string>()
  for (const e of events) {
    const entries: { id?: string; name?: string }[] = [
      { id: e.extendedProps.promoterId || e.extendedProps.promoterName, name: e.extendedProps.promoterName },
      ...(e.extendedProps.nightActs || []).map((a) => ({
        id: a.promoterId || a.promoterName,
        name: a.promoterName,
      })),
    ]
    for (const entry of entries) {
      const id = entry.id
      if (!id || seen.has(id)) continue
      seen.set(id, entry.name || id)
    }
  }
  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Venue entry for filter UI (key = canonical key, name = display name)
 */
export interface VenueOption {
  key: string
  name: string
}

/**
 * Get unique venue options from events (for filter UI). No hardcoded list.
 */
export function getAllVenues(events?: NormalizedEvent[]): VenueOption[] {
  if (!events?.length) return []
  const byKey = new Map<string, string>()
  for (const e of events) {
    const id = e.extendedProps.venueId || e.extendedProps.venueKey
    const name = e.extendedProps.venueName
    const key = (id || name?.toLowerCase().trim().replace(/\s+/g, '-') || '').trim()
    if (key && !byKey.has(key)) byKey.set(key, name || key)
  }
  return Array.from(byKey.entries())
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
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
