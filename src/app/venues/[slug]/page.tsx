'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { fetchVenues, fetchEvents } from '@/lib/eventsAdapter'
import { logActivity } from '@/lib/activityLog'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'
import FollowVenueButton from '@/components/FollowVenueButton'
import EventModal from '@/app/calendar/components/EventModal'
import { EventImageThumb } from '@/components/EventImageGallery'
import { normalizeVenueSlugParam, slugifyVenueSegment } from '@/lib/venuePath'

function venuePlaceholderDataUri(label: string): string {
  const initial = (label || '?').trim().charAt(0).toUpperCase() || '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="#111"/>
  <text x="400" y="250" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="120" fill="#fff">${initial}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default function VenueDetailPage() {
  const params = useParams()
  const rawSlug = typeof params.slug === 'string' ? params.slug : ''
  const slug = normalizeVenueSlugParam(rawSlug)

  const [venues, setVenues] = useState<Awaited<ReturnType<typeof fetchVenues>>>([])
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)

  useEffect(() => {
    if (slug) logActivity('click_venue', 'venue', slug)
  }, [slug])

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

  const venue = useMemo(() => {
    return venues.find((v) => {
      const candidates = [v.slug, v.venue_id, v.name].filter(Boolean).map((s) => slugifyVenueSegment(String(s)))
      return candidates.includes(slug) || v.slug === rawSlug || v.venue_id === rawSlug
    })
  }, [venues, slug, rawSlug])

  const now = Date.now()
  const venueMatchKeys = new Set<string>(
    [slug, venue?.venue_id, venue?.slug, venue?.name ? slugifyVenueSegment(venue.name) : '']
      .filter(Boolean)
      .map((s) => slugifyVenueSegment(String(s)))
  )

  const upcomingEvents = events
    .filter((e) => {
      const eventVenueId = e.extendedProps.venueId
      const eventVenueKey = e.extendedProps.venueKey
      const eventKeyFromName = slugifyVenueSegment(e.extendedProps.venueName || '')
      const matches =
        (eventVenueId && (venueMatchKeys.has(slugifyVenueSegment(eventVenueId)) || venueMatchKeys.has(eventVenueId))) ||
        (eventVenueKey && (venueMatchKeys.has(slugifyVenueSegment(eventVenueKey)) || venueMatchKeys.has(eventVenueKey))) ||
        (eventKeyFromName && venueMatchKeys.has(eventKeyFromName))
      return !!matches && new Date(e.start).getTime() >= now
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const displayName = venue?.name || upcomingEvents[0]?.extendedProps.venueName || slug
  const heroSrc =
    venue?.primary_image_url ||
    upcomingEvents[0]?.extendedProps.imageUrl ||
    venuePlaceholderDataUri(displayName)

  if (!venue && upcomingEvents.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-terminus-bg text-terminus-fg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">Venue not found</h1>
          <Link href="/venues" className="terminus-link">
            ← Back to Venues
          </Link>
        </div>
      </div>
    )
  }

  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(d)

  return (
    <div className="min-h-screen bg-terminus-bg text-terminus-fg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/venues" className="inline-flex items-center gap-2 terminus-link mb-6">
          ← Back to Venues
        </Link>

        <div className="mb-6 sm:mb-8 border-2 border-terminus-strong bg-terminus-elevated overflow-hidden">
          <div className="aspect-[16/10] sm:aspect-[21/9] bg-terminus-muted flex-shrink-0">
            <img
              src={heroSrc}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = venuePlaceholderDataUri(displayName)
              }}
            />
          </div>
          <div className="p-4 sm:p-6">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-bold terminus-heading">{displayName}</h1>
              <FollowVenueButton
                venueId={(venue?.venue_id || venue?.slug || slug).toString()}
                displayName={displayName}
                size="md"
                variant="default"
              />
            </div>
            {(venue?.neighborhood || venue?.venue_address) && (
              <p className="text-terminus-fg-muted">
                {[venue?.neighborhood, venue?.venue_address].filter(Boolean).join(' · ')}
              </p>
            )}
            {venue?.description_short && (
              <p className="text-terminus-fg-muted mt-3">{venue.description_short}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-4">
              {venue?.website_url && (
                <a
                  href={venue.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="terminus-link text-sm font-medium"
                >
                  Website
                </a>
              )}
              {venue?.instagram_handle && (
                <a
                  href={`https://instagram.com/${venue.instagram_handle.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="terminus-link text-sm font-medium"
                >
                  Instagram
                </a>
              )}
            </div>
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-4">Upcoming events</h2>

        {loading ? (
          <div className="text-terminus-fg-muted">Loading events...</div>
        ) : upcomingEvents.length === 0 ? (
          <p className="text-terminus-fg-muted">No upcoming events at this venue.</p>
        ) : (
          <ul className="space-y-4">
            {upcomingEvents.map((event) => {
              const categoryColor = getCategoryColor(event.extendedProps.category)
              return (
                <li
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedEvent(event)
                    logActivity('view_event_modal', 'event', event.id, { title: event.title })
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedEvent(event)}
                  className="border-2 border-terminus-border bg-terminus-elevated overflow-hidden cursor-pointer hover:bg-terminus-muted transition-colors"
                >
                  <div className="p-4 flex flex-col sm:flex-row gap-4">
                    <EventImageThumb
                      imageUrl={event.extendedProps.imageUrl}
                      imageUrls={event.extendedProps.imageUrls}
                      alt={event.title}
                      className="w-full sm:w-24 h-40 sm:h-24 flex-shrink-0 border border-terminus-border"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">{event.title}</h3>
                      <p className="text-terminus-fg-muted text-sm mt-1">
                        {formatDate(new Date(event.start))}
                        {event.end && ` – ${formatDate(new Date(event.end))}`}
                      </p>
                      {event.extendedProps.descriptionShort && (
                        <p className="text-terminus-fg-muted text-sm mt-2 line-clamp-2">
                          {event.extendedProps.descriptionShort}
                        </p>
                      )}
                      {event.extendedProps.category && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span
                            className="px-2 py-0.5 text-xs font-medium border"
                            style={{ borderColor: categoryColor, color: categoryColor }}
                          >
                            {event.extendedProps.category}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      </div>
    </div>
  )
}
