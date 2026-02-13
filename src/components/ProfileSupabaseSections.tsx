'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchVenues, fetchEvents, fetchPromoters } from '@/lib/eventsAdapter'
import type { NormalizedEvent, VenueForDisplay } from '@/lib/eventsAdapter'
import type { Promoter } from '@/models/Promoter'
import EventCardsSlider from './EventCardsSlider'

function norm(s: string): string {
  return (s || '').toLowerCase().trim()
}

function normEventId(id: string): string {
  return (id || '').toLowerCase().trim()
}

function eventMatchesIdSet(e: NormalizedEvent, ids: Set<string>): boolean {
  const id = normEventId(e.id)
  if (id && ids.has(id)) return true
  const srcId = e.extendedProps?.sourceEventId
  if (srcId && ids.has(normEventId(srcId))) return true
  const dedupeKey = e.extendedProps?.dedupeKey
  if (dedupeKey && ids.has(normEventId(dedupeKey))) return true
  return false
}

interface ProfileSupabaseSectionsProps {
  followedVenueIds: Set<string>
  followedPromoterIds: Set<string>
  wishlistedEventIds: Set<string>
  likedEventIds: Set<string>
  goingIds: Set<string>
  interestedIds: Set<string>
  onEventClick: (event: NormalizedEvent) => void
}

export default function ProfileSupabaseSections({
  followedVenueIds,
  followedPromoterIds,
  wishlistedEventIds,
  likedEventIds,
  goingIds,
  interestedIds,
  onEventClick,
}: ProfileSupabaseSectionsProps) {
  const [venues, setVenues] = useState<VenueForDisplay[]>([])
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [promoters, setPromoters] = useState<Promoter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [v, e, p] = await Promise.all([
          fetchVenues(),
          fetchEvents(),
          fetchPromoters(),
        ])
        setVenues(v)
        setEvents(e)
        setPromoters(p)
      } catch (err) {
        console.error('Failed to load profile data:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const now = Date.now()
  const goingEvents = events.filter((e) => eventMatchesIdSet(e, goingIds)).filter((e) => new Date(e.start).getTime() >= now)
  const savedEventsPre = events.filter((e) => eventMatchesIdSet(e, wishlistedEventIds)).filter((e) => new Date(e.start).getTime() >= now)
  const likedEventsPre = events.filter((e) => eventMatchesIdSet(e, likedEventIds)).filter((e) => new Date(e.start).getTime() >= now)
  const followedVenues = venues.filter((v) => {
    const id = norm(v.venue_id || '')
    const slug = norm(v.slug || '')
    const name = norm(v.name || '').replace(/\s+/g, '-')
    return followedVenueIds.has(id) || followedVenueIds.has(slug) || followedVenueIds.has(name)
  })

  const followedPromotersList = promoters.filter((p) => {
    const id = norm(p.promoter_id || '')
    const slug = norm(p.slug || '')
    const name = norm(p.name || '').replace(/\s+/g, '-')
    return followedPromoterIds.has(id) || followedPromoterIds.has(slug) || followedPromoterIds.has(name)
  })

  const eventsAtFollowed = events.filter((e) => {
    if (new Date(e.start).getTime() < now) return false
    const venueKey = norm(e.extendedProps.venueId || e.extendedProps.venueKey || e.extendedProps.venueName || '')
    const promoterKey = norm(e.extendedProps.promoterId || e.extendedProps.promoterName || '')
    const venueMatch = venueKey && followedVenueIds.has(venueKey)
    const promoterMatch = promoterKey && followedPromoterIds.has(promoterKey)
    return venueMatch || promoterMatch
  })

  const savedEvents = [...savedEventsPre].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  if (loading) {
    return (
      <div className="text-slate-400 py-8">Loading your profile data...</div>
    )
  }

  return (
    <>
      {/* Followed Venues - Cards */}
      <div className="mb-10">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Followed Venues</h2>
        {followedVenues.length === 0 ? (
          <p className="text-slate-500">No followed venues yet. Follow venues from event cards or venue pages.</p>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {followedVenues.map((v) => (
              <Link
                key={v.venue_id}
                href={`/venues/${encodeURIComponent(v.slug)}`}
                className="block rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden hover:bg-slate-700/50 hover:border-slate-600 transition-all"
              >
                <div className="aspect-[16/10] bg-slate-700/50 flex-shrink-0">
                  <img
                    src={v.primary_image_url || '/lisboa.png'}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-lg text-white">{v.name}</h3>
                  {(v.neighborhood || v.venue_address) && (
                    <p className="text-slate-400 text-sm mt-0.5">
                      {[v.neighborhood, v.venue_address].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Followed Promoters - Cards */}
      <div className="mb-10">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Followed Promoters</h2>
        {followedPromotersList.length === 0 ? (
          <p className="text-slate-500">No followed promoters yet. Follow promoters from promoter pages.</p>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {followedPromotersList.map((p) => (
              <Link
                key={p.promoter_id}
                href={`/promoters/${encodeURIComponent(p.slug)}`}
                className="block rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden hover:bg-slate-700/50 hover:border-slate-600 transition-all p-4"
              >
                <div className="flex items-center gap-3">
                  {p.primary_image_url && (
                    <img
                      src={p.primary_image_url}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-white">{p.name}</h3>
                    {p.description_short && (
                      <p className="text-slate-400 text-sm mt-0.5 line-clamp-2">{p.description_short}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming (Going) */}
      <div className="mb-10">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Upcoming (Going)</h2>
        <EventCardsSlider
          events={[...goingEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())}
          onEventClick={onEventClick}
          mode="slider"
          hideHeader={false}
          skipFiltering={true}
          venuesWithCoords={venues}
        />
      </div>

      {/* Events at Followed Venues & Promoters */}
      <div className="mb-10">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Events at Your Venues & Promoters</h2>
        <EventCardsSlider
          events={eventsAtFollowed}
          onEventClick={onEventClick}
          mode="slider"
          hideHeader={false}
          skipFiltering={false}
          venuesWithCoords={venues}
        />
      </div>

      {/* Saved Events (formerly Wishlisted) */}
      <div className="mb-10">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Saved Events</h2>
        <EventCardsSlider
          events={savedEvents}
          onEventClick={onEventClick}
          mode="slider"
          hideHeader={false}
          skipFiltering={true}
          venuesWithCoords={venues}
        />
      </div>

      {/* Liked Events */}
      <div className="mb-10">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Liked Events</h2>
        <EventCardsSlider
          events={[...likedEventsPre].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())}
          onEventClick={onEventClick}
          mode="slider"
          hideHeader={false}
          skipFiltering={true}
          venuesWithCoords={venues}
        />
      </div>
    </>
  )
}
