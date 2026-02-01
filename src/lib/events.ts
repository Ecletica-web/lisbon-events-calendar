import Papa from 'papaparse'

export interface RawEvent {
  id: string
  title: string
  start_datetime: string
  end_datetime?: string
  venue_name?: string
  tags?: string
  source_url?: string
}

export interface NormalizedEvent {
  id: string
  title: string
  start: string
  end?: string
  extendedProps: {
    venue?: string
    tags: string[]
    sourceUrl?: string
  }
}

export async function fetchEvents(): Promise<NormalizedEvent[]> {
  const csvUrl = process.env.NEXT_PUBLIC_EVENTS_CSV_URL

  if (!csvUrl) {
    console.warn('NEXT_PUBLIC_EVENTS_CSV_URL is not set')
    return []
  }

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
            const normalized = results.data
              .filter((row) => {
                // Ignore rows missing required fields
                return row.id && row.title && row.start_datetime
              })
              .map((row) => normalizeEvent(row))
            
            resolve(normalized)
          } catch (error) {
            reject(error)
          }
        },
        error: (error: Error) => {
          reject(error)
        },
      })
    })
  } catch (error) {
    console.error('Error fetching events:', error)
    return []
  }
}

function normalizeEvent(row: RawEvent): NormalizedEvent {
  // Split tags by comma, trim, lowercase
  const tags = row.tags
    ? row.tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
    : []

  return {
    id: row.id,
    title: row.title,
    start: row.start_datetime,
    end: row.end_datetime || undefined,
    extendedProps: {
      venue: row.venue_name || undefined,
      tags,
      sourceUrl: row.source_url || undefined,
    },
  }
}

export function filterEvents(
  events: NormalizedEvent[],
  searchQuery: string,
  selectedTags: string[]
): NormalizedEvent[] {
  let filtered = events

  // Text search (title, venue, tags)
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim()
    filtered = filtered.filter((event) => {
      const titleMatch = event.title.toLowerCase().includes(query)
      const venueMatch = event.extendedProps.venue?.toLowerCase().includes(query)
      const tagsMatch = event.extendedProps.tags.some((tag) =>
        tag.includes(query)
      )
      return titleMatch || venueMatch || tagsMatch
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

  return filtered
}

export function getAllTags(events: NormalizedEvent[]): string[] {
  const tagSet = new Set<string>()
  events.forEach((event) => {
    event.extendedProps.tags.forEach((tag) => tagSet.add(tag))
  })
  return Array.from(tagSet).sort()
}
