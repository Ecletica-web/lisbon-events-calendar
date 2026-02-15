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

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-slate-800/40 border border-slate-700/50 overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-slate-700/60" />
      <div className="p-5 space-y-3">
        <div className="h-6 bg-slate-700/60 rounded w-3/4" />
        <div className="h-4 bg-slate-700/40 rounded w-1/2" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-16 bg-slate-700/40 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ForYouPage() {
  const auth = useSupabaseAuth()
  const user = auth?.user
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-900 pb-28">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-purple-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/2 w-72 h-72 bg-pink-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-16 sm:pt-20">
        {/* Hero */}
        <header className="mb-10 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            <span className="bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              For You
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-md leading-relaxed">
            Your personal event feed — powered by venues you follow, promoters, personas, and what your friends are going to.
          </p>
        </header>

        {loading && events.length === 0 ? (
          <div className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {events.map((event, i) => (
              <div
                key={event.id}
                className="opacity-0 animate-[fadeSlideIn_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${Math.min(i * 80, 400)}ms` }}
              >
                <FeedCard
                  event={event}
                  reasons={reasons[event.id] || []}
                  onOpen={() => {
                    setSelectedEvent(event)
                    logActivity('view_event_modal', 'event', event.id, { title: event.title })
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          reasons={selectedEvent ? (reasons[selectedEvent.id] || []) : undefined}
        />

        {!loading && events.length === 0 && (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm p-8 sm:p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 mb-6">
        <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-slate-200 mb-2">Your feed is waiting</h2>
      <p className="text-slate-400 text-sm sm:text-base max-w-sm mx-auto mb-6 leading-relaxed">
        Follow venues and promoters, create personas, and we&apos;ll surface events you&apos;ll love. Your friends&apos; picks will show up too.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/calendar"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20"
        >
          Browse calendar
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl border border-slate-600/50 text-slate-300 font-medium hover:bg-slate-800/50 hover:border-slate-500 transition-all"
        >
          Follow venues & create personas
        </Link>
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
  const priceLabel = p.isFree
    ? 'Free'
    : p.priceMin !== undefined && p.priceMax !== undefined
      ? `${p.priceMin === p.priceMax ? p.priceMin : `${p.priceMin}–${p.priceMax}`} €`
      : p.priceMin !== undefined
        ? `From ${p.priceMin} €`
        : null

  return (
    <article
      className="group rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-indigo-500/5 hover:border-slate-600/70 transition-all duration-300 cursor-pointer"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="aspect-[4/3] relative bg-slate-800 overflow-hidden">
        <img
          src={p.imageUrl || '/lisboa.png'}
          alt={event.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-1.5">
          {reasons.slice(0, 3).map((r) => (
            <span
              key={r}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/15 text-white backdrop-blur-md border border-white/10"
            >
              {r}
            </span>
          ))}
          {p.isFree && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/90 text-white">
              Free
            </span>
          )}
        </div>
        {priceLabel && !p.isFree && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-medium bg-black/50 text-slate-200 backdrop-blur-sm">
            {priceLabel}
          </div>
        )}
        <div className="absolute bottom-3 left-3 right-3">
          <h2 className="font-bold text-white text-lg sm:text-xl line-clamp-2 drop-shadow-lg">{event.title}</h2>
          <p className="text-slate-200/90 text-sm mt-0.5 truncate">{p.venueName || 'TBA'}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
          <time dateTime={event.start}>
            {start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {p.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border"
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
            {p.venueId && <FollowVenueButton venueId={p.venueId} displayName={p.venueName || p.venueId} />}
            {p.promoterId && <FollowPromoterButton promoterId={p.promoterId} displayName={p.promoterName || p.promoterId} />}
            <EventActionButtons eventId={event.id} eventTitle={event.title} eventStart={event.start} compact />
          </div>
        </div>
      </div>
    </article>
  )
}
