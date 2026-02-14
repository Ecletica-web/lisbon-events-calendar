'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { useUserActions } from '@/contexts/UserActionsContext'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'
import EventActionButtons from '@/components/EventActionButtons'
import EventCounts from '@/components/EventCounts'
import EventLikeCount from '@/components/EventLikeCount'
import FollowVenueButton from '@/components/FollowVenueButton'
import FollowPromoterButton from '@/components/FollowPromoterButton'
import EventModal from '@/app/calendar/components/EventModal'
import { logActivity } from '@/lib/activityLog'

export default function ForYouPage() {
  const auth = useSupabaseAuth()
  const user = auth?.user
  const actions = useUserActions()
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [reasons, setReasons] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)

  const fetchFeed = useCallback(async () => {
    setLoading(true)
    try {
      const headers: HeadersInit = {}
      if (user) {
        const { supabase } = await import('@/lib/supabase/client')
        const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      }
      const res = await fetch('/api/foryou', { headers })
      const data = await res.json()
      setEvents(data.events || [])
      setReasons(data.reasons || {})
      logActivity('scroll_feed', 'event', undefined, { count: (data.events || []).length })
    } catch (e) {
      console.error('For You fetch error:', e)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchFeed()
  }, [fetchFeed])

  if (loading && events.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900/95 flex items-center justify-center pt-24">
        <div className="text-slate-400">Loading your feed...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900/95 pb-24">
      <div className="max-w-xl mx-auto px-4 pt-20">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
          For You
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          Events picked for you based on who you follow and what you like.
        </p>

        <div className="space-y-6">
          {events.map((event) => (
            <FeedCard
              key={event.id}
              event={event}
              reasons={reasons[event.id] || []}
              onOpen={() => {
                setSelectedEvent(event)
                logActivity('view_event_modal', 'event', event.id, { title: event.title })
              }}
            />
          ))}
        </div>

        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          reasons={selectedEvent ? (reasons[selectedEvent.id] || []) : undefined}
        />

        {events.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p>No upcoming events right now.</p>
            <Link href="/calendar" className="text-indigo-400 hover:underline mt-2 inline-block">
              Browse calendar
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function FeedCard({
  event,
  reasons,
  onOpen,
}: {
  event: NormalizedEvent
  reasons: string[]
  onOpen: () => void
}) {
  const p = event.extendedProps
  const start = new Date(event.start)
  const categoryColor = getCategoryColor(p.category)

  return (
    <article
      className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden shadow-lg hover:border-slate-600 transition-colors cursor-pointer"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="aspect-[16/9] relative bg-slate-800">
        <img
          src={p.imageUrl || '/lisboa.png'}
          alt={event.title}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
        />
        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
          {reasons.slice(0, 3).map((r) => (
            <span
              key={r}
              className="px-2 py-0.5 rounded text-xs font-medium bg-black/60 text-white backdrop-blur-sm"
            >
              {r}
            </span>
          ))}
        </div>
      </div>
      <div className="p-4">
        <h2 className="font-bold text-white text-lg mb-1 line-clamp-2">{event.title}</h2>
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <span>{p.venueName || 'TBA'}</span>
          <span>·</span>
          <time dateTime={event.start}>
            {start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {p.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded text-xs border"
              style={{ borderColor: categoryColor, color: categoryColor }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <EventCounts eventId={event.id} />
            <EventLikeCount eventId={event.id} />
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {p.venueId && <FollowVenueButton venueId={p.venueId} />}
            {p.promoterId && <FollowPromoterButton promoterId={p.promoterId} displayName={p.promoterName || p.promoterId} />}
            <EventActionButtons eventId={event.id} eventTitle={event.title} eventStart={event.start} compact />
          </div>
        </div>
      </div>
    </article>
  )
}
