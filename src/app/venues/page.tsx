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
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link
          href="/calendar"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Calendar
        </Link>

        <h1 className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Venues
        </h1>

        <div className="mb-6 space-y-3">
          <input
            type="text"
            placeholder="Search venues (name, neighborhood, tags)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-slate-600/50 rounded-lg px-4 py-2 bg-slate-800/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-slate-400">Loading venues...</div>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {filteredVenues.map((v) => {
              const count = getEventCount(v)
              return (
                <Link
                  key={v.venue_id}
                  href={`/venues/${encodeURIComponent(v.slug)}`}
                  className="block rounded-lg bg-slate-800/60 border border-slate-700/50 overflow-hidden hover:bg-slate-700/50 transition-colors"
                >
                  <div className="aspect-[16/10] bg-slate-700/50 flex-shrink-0">
                    <img
                      src={v.primary_image_url || '/lisboa.png'}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
                    />
                  </div>
                  <div className="p-2.5">
                    <h2 className="font-semibold text-sm text-white truncate">{v.name}</h2>
                    {(v.neighborhood || v.venue_address) && (
                      <p className="text-slate-400 text-xs mt-0.5 truncate">
                        {[v.neighborhood, v.venue_address].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {v.description_short && (
                      <p className="text-slate-300 text-xs mt-1 line-clamp-2">{v.description_short}</p>
                    )}
                    {v.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {v.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/60 text-slate-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-slate-400 text-xs mt-1">
                      {count} upcoming
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {!loading && filteredVenues.length === 0 && (
          <p className="text-slate-400">No venues match your filters.</p>
        )}
      </div>
    </div>
  )
}
