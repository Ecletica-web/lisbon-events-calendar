'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { fetchVenues, fetchEvents } from '@/lib/eventsAdapter'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'

export default function VenueDetailPage() {
  const params = useParams()
  const slug = typeof params.slug === 'string' ? params.slug : ''

  const [venues, setVenues] = useState<Awaited<ReturnType<typeof fetchVenues>>>([])
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [v, e] = await Promise.all([fetchVenues(), fetchEvents()])
        setVenues(v)
        setEvents(e)
      } catch (err) {
        console.error('Failed to load:', err)
        setVenues([])
        setEvents([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const venue = venues.find((v) => v.slug === slug || v.venue_id === slug)
  const now = Date.now()
  const upcomingEvents = events
    .filter((e) => {
      const key =
        e.extendedProps.venueId ||
        e.extendedProps.venueKey ||
        e.extendedProps.venueName?.toLowerCase().trim().replace(/\s+/g, '-') ||
        ''
      const matches = key === slug || e.extendedProps.venueKey === slug || e.extendedProps.venueId === slug
      return matches && new Date(e.start).getTime() >= now
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link
          href="/venues"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Venues
        </Link>

        {/* Richer header */}
        <div className="mb-6 sm:mb-8 rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
          <div className="aspect-[16/10] sm:aspect-[21/9] bg-slate-700/50 flex-shrink-0">
            <img
              src={venue?.primary_image_url || '/lisboa.png'}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
            />
          </div>
          <div className="p-4 sm:p-6">
            <h1 className="text-2xl font-bold mb-2 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {displayName}
            </h1>
            {(venue?.neighborhood || venue?.venue_address) && (
              <p className="text-slate-300">
                {[venue?.neighborhood, venue?.venue_address].filter(Boolean).join(' · ')}
              </p>
            )}
            {venue?.description_short && (
              <p className="text-slate-300 mt-3">{venue.description_short}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-4">
              {venue?.website_url && (
                <a
                  href={venue.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                >
                  Website
                </a>
              )}
              {venue?.instagram_handle && (
                <a
                  href={`https://instagram.com/${venue.instagram_handle.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                >
                  Instagram
                </a>
              )}
            </div>
            {venue && venue.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {venue.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-4">Upcoming events</h2>

        {loading ? (
          <div className="text-slate-400">Loading events...</div>
        ) : upcomingEvents.length === 0 ? (
          <p className="text-slate-400">No upcoming events at this venue.</p>
        ) : (
          <ul className="space-y-4">
            {upcomingEvents.map((event) => {
              const categoryColor = getCategoryColor(event.extendedProps.category)
              return (
                <li
                  key={event.id}
                  className="rounded-lg bg-slate-800/60 border border-slate-700/50 overflow-hidden"
                >
                  <div className="p-4 flex flex-col sm:flex-row gap-4">
                    <img
                      src={event.extendedProps.imageUrl || '/lisboa.png'}
                      alt=""
                      className="w-full sm:w-24 h-40 sm:h-24 object-cover rounded flex-shrink-0"
                      onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">{event.title}</h3>
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
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
