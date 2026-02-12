'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchEvents, getAllVenues, type NormalizedEvent } from '@/lib/eventsAdapter'

export default function VenuesPage() {
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await fetchEvents()
        setEvents(data)
      } catch (e) {
        console.error('Failed to load events:', e)
        setEvents([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const venues = getAllVenues()
  const now = Date.now()

  // Count upcoming events per venue
  const eventCountByVenue = new Map<string, number>()
  for (const e of events) {
    const key = e.extendedProps.venueKey || e.extendedProps.venueId || e.extendedProps.venueName?.toLowerCase().trim() || ''
    if (!key) continue
    const start = new Date(e.start).getTime()
    if (start >= now) {
      eventCountByVenue.set(key, (eventCountByVenue.get(key) || 0) + 1)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link
          href="/calendar"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Calendar
        </Link>

        <h1 className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Venues
        </h1>

        {loading ? (
          <div className="text-slate-400">Loading venues...</div>
        ) : (
          <ul className="space-y-2">
            {venues.map((v) => {
              const count = eventCountByVenue.get(v.key) || 0
              return (
                <li key={v.key}>
                  <Link
                    href={`/venues/${encodeURIComponent(v.key)}`}
                    className="flex justify-between items-center py-3 px-4 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 transition-colors"
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="text-slate-400 text-sm">
                      {count} upcoming {count === 1 ? 'event' : 'events'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
