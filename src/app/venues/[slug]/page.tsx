'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { fetchEvents, getAllVenues } from '@/lib/eventsAdapter'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'

export default function VenueDetailPage() {
  const params = useParams()
  const slug = typeof params.slug === 'string' ? params.slug : ''

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
  const venue = venues.find((v) => v.key === slug)
  const now = Date.now()

  const upcomingEvents = events
    .filter((e) => {
      const key = e.extendedProps.venueKey || e.extendedProps.venueId || e.extendedProps.venueName?.toLowerCase().replace(/\s+/g, '-') || ''
      const matches = key === slug || e.extendedProps.venueKey === slug || e.extendedProps.venueId === slug
      const start = new Date(e.start).getTime()
      return matches && start >= now
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const displayName = venue?.name || upcomingEvents[0]?.extendedProps.venueName || slug

  if (!venue && upcomingEvents.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">Venue not found</h1>
          <Link href="/venues" className="text-indigo-400 hover:text-indigo-300">
            ← Back to Venues
          </Link>
        </div>
      </div>
    )
  }

  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(d)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link
          href="/venues"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Venues
        </Link>

        <h1 className="text-2xl font-bold mb-2 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          {displayName}
        </h1>

        {loading ? (
          <div className="text-slate-400">Loading events...</div>
        ) : (
          <>
            <p className="text-slate-400 mb-6">
              {upcomingEvents.length} upcoming {upcomingEvents.length === 1 ? 'event' : 'events'}
            </p>

            <ul className="space-y-4">
              {upcomingEvents.map((event) => {
                const categoryColor = getCategoryColor(event.extendedProps.category)
                return (
                  <li
                    key={event.id}
                    className="rounded-lg bg-slate-800/60 border border-slate-700/50 overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="font-semibold text-lg">{event.title}</h2>
                          <p className="text-slate-400 text-sm mt-1">
                            {formatDate(new Date(event.start))}
                            {event.end && ` – ${formatDate(new Date(event.end))}`}
                          </p>
                          {event.extendedProps.descriptionShort && (
                            <p className="text-slate-300 text-sm mt-2 line-clamp-2">
                              {event.extendedProps.descriptionShort}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {event.extendedProps.category && (
                              <span
                                className="px-2 py-0.5 rounded text-xs font-medium text-white"
                                style={{ backgroundColor: categoryColor }}
                              >
                                {event.extendedProps.category}
                              </span>
                            )}
                            {event.extendedProps.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        {event.extendedProps.imageUrl && (
                          <img
                            src={event.extendedProps.imageUrl}
                            alt=""
                            className="w-24 h-24 object-cover rounded flex-shrink-0"
                          />
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {upcomingEvents.length === 0 && (
              <p className="text-slate-400">No upcoming events at this venue.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
