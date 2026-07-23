'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { fetchVenues, fetchEvents, type VenueForDisplay } from '@/lib/eventsAdapter'
import { useDebounce } from '@/lib/useDebounce'

export default function VenuesPage() {
  const [venues, setVenues] = useState<VenueForDisplay[]>([])
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchEvents>>>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const debouncedSearch = useDebounce(searchQuery, 300)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [v, e] = await Promise.all([fetchVenues(), fetchEvents()])
        setVenues(v)
        setEvents(e)
      } catch (err) {
        console.error('Failed to load venues/events:', err)
        setVenues([])
        setEvents([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const now = Date.now()
  const eventCountByVenue = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) {
      const key =
        e.extendedProps.venueId ||
        e.extendedProps.venueKey ||
        e.extendedProps.venueName?.toLowerCase().trim().replace(/\s+/g, '-') ||
        ''
      if (!key) continue
      if (new Date(e.start).getTime() >= now) {
        m.set(key, (m.get(key) || 0) + 1)
      }
    }
    return m
  }, [events])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    venues.forEach((v) => v.tags.forEach((t) => s.add(t)))
    return Array.from(s).sort()
  }, [venues])

  const filteredVenues = useMemo(() => {
    let list = venues
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.neighborhood || '').toLowerCase().includes(q) ||
          (v.venue_address || '').toLowerCase().includes(q) ||
          v.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (selectedTags.length > 0) {
      list = list.filter((v) => selectedTags.some((t) => v.tags.includes(t)))
    }
    return list
  }, [venues, debouncedSearch, selectedTags])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const getEventCount = (v: VenueForDisplay) =>
    eventCountByVenue.get(v.venue_id) || eventCountByVenue.get(v.slug) || 0

  return (
    <div className="min-h-screen min-h-[100dvh] bg-pager-bg text-pager-fg">
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 pt-14 sm:pt-16 pb-[env(safe-area-inset-bottom)]">
        <Link href="/calendar" className="pager-link text-xs uppercase tracking-wider mb-6 inline-block">
          ← Calendar
        </Link>

        <div className="flex items-end justify-between gap-4 mb-2 flex-wrap">
          <h1 className="pager-heading">VENUES</h1>
          <Link href="/promoters" className="text-[10px] uppercase tracking-wider text-pager-fg-muted hover:text-pager-fg underline">
            See promoters →
          </Link>
        </div>
        <p className="text-pager-fg-muted text-sm mb-4 sm:mb-6 max-w-xl">
          Physical places — clubs, museums, theatres. Follow a venue for your For You feed.
        </p>

        <div className="mb-6 space-y-3">
          <input
            type="text"
            placeholder="Search venues (name, neighborhood, tags)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pager-input"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`pager-pill ${selectedTags.includes(tag) ? 'pager-pill-active' : ''}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-pager-fg-muted text-sm">Loading venues...</div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredVenues.map((v) => {
              const count = getEventCount(v)
              return (
                <Link
                  key={v.venue_id}
                  href={`/venues/${encodeURIComponent(v.slug)}`}
                  className="pager-panel block overflow-hidden hover:bg-pager-muted transition-colors"
                >
                  <div className="aspect-[16/10] bg-pager-muted flex-shrink-0 border-b-2 border-pager-strong">
                    <img
                      src={v.primary_image_url || '/lisboa.png'}
                      alt=""
                      className="w-full h-full object-cover grayscale contrast-125"
                      onError={(e) => {
                        e.currentTarget.src = '/lisboa.png'
                      }}
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-[9px] uppercase tracking-widest text-pager-fg-faint mb-1">Venue</div>
                    <h2 className="font-semibold text-base text-pager-fg">{v.name}</h2>
                    {(v.neighborhood || v.venue_address) && (
                      <p className="text-pager-fg-muted text-xs mt-0.5">
                        {[v.neighborhood, v.venue_address].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {v.description_short && (
                      <p className="text-pager-fg-muted text-xs mt-2 line-clamp-2">{v.description_short}</p>
                    )}
                    {v.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {v.tags.map((tag) => (
                          <span key={tag} className="pager-pill">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-pager-fg-faint text-xs mt-2">
                      {count} upcoming {count === 1 ? 'event' : 'events'}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {!loading && filteredVenues.length === 0 && (
          <p className="text-pager-fg-muted text-sm">No venues match your filters.</p>
        )}
      </div>
    </div>
  )
}
