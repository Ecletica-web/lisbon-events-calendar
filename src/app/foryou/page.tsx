'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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

const SWIPE_THRESHOLD = 80
const SWIPE_EXIT_MS = 250

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
  const actions = useUserActions()
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [reasons, setReasons] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)

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
      let feedEvents: NormalizedEvent[] = data.events || []
      const reasonsMap: Record<string, string[]> = data.reasons || {}

      if (feedEvents.length === 0) {
        const eventsRes = await fetch('/api/events')
        if (eventsRes.ok) {
          const allEvents: NormalizedEvent[] = await eventsRes.json()
          const now = new Date().toISOString()
          const upcoming = allEvents.filter((e) => e.start >= now)
          if (upcoming.length > 0) {
            const shuffled = [...upcoming].sort(() => Math.random() - 0.5)
            feedEvents = shuffled.slice(0, 50)
          }
        }
      }

      setEvents(feedEvents)
      setReasons(reasonsMap)
      setCurrentCardIndex(0)
      logActivity('scroll_feed', 'event', undefined, { count: feedEvents.length })
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
        ) : events.length > 0 ? (
          <div className="relative" style={{ minHeight: '420px' }}>
            {/* Next card peeking behind */}
            {currentCardIndex + 1 < events.length && (
              <div className="absolute inset-0 top-2 left-1 right-1 scale-[0.96] opacity-90 pointer-events-none">
                <FeedCard
                  event={events[currentCardIndex + 1]}
                  reasons={reasons[events[currentCardIndex + 1].id] || []}
                  onOpen={() => {}}
                  showSwipeButtons={false}
                />
              </div>
            )}
            {/* Current swipeable card */}
            {currentCardIndex < events.length && (
              <SwipeableFeedCard
                key={events[currentCardIndex].id}
                event={events[currentCardIndex]}
                reasons={reasons[events[currentCardIndex].id] || []}
                onOpen={() => {
                  setSelectedEvent(events[currentCardIndex])
                  logActivity('view_event_modal', 'event', events[currentCardIndex].id, { title: events[currentCardIndex].title })
                }}
                onLike={async () => {
                  if (actions) await actions.likeEvent(events[currentCardIndex].id)
                  setCurrentCardIndex((i) => i + 1)
                }}
                onPass={() => setCurrentCardIndex((i) => i + 1)}
              />
            )}
            {!loading && currentCardIndex >= events.length && events.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm py-12">
                <p className="text-slate-400 text-lg font-medium">You&apos;re all caught up</p>
                <p className="text-slate-500 text-sm mt-1">Come back later for more events</p>
                <button
                  type="button"
                  onClick={() => setCurrentCardIndex(0)}
                  className="mt-6 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                >
                  Browse again
                </button>
              </div>
            )}
          </div>
        ) : null}

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

function SwipeableFeedCard({
  event,
  reasons,
  onOpen,
  onLike,
  onPass,
}: {
  event: NormalizedEvent
  reasons: string[]
  onOpen: () => void
  onLike: () => void | Promise<void>
  onPass: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isExiting, setIsExiting] = useState<'like' | 'pass' | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const didMoveEnough = useRef(false)

  const handleStart = useCallback((clientX: number) => {
    pointerStart.current = { x: clientX, y: 0 }
    didMoveEnough.current = false
    setIsDragging(true)
  }, [])

  const handleMove = useCallback((clientX: number) => {
    if (pointerStart.current === null || isExiting) return
    const delta = clientX - pointerStart.current.x
    if (Math.abs(delta) > 10) didMoveEnough.current = true
    const clamped = Math.max(-200, Math.min(200, delta))
    setDragOffset(clamped)
  }, [isExiting])

  const handleEnd = useCallback(() => {
    if (isExiting) return
    const commit = dragOffset > SWIPE_THRESHOLD ? 'like' : dragOffset < -SWIPE_THRESHOLD ? 'pass' : null
    if (commit) {
      didMoveEnough.current = true
      setIsExiting(commit)
      setDragOffset(commit === 'like' ? 400 : -400)
      setTimeout(() => {
        if (commit === 'like') void Promise.resolve(onLike()).then(() => {})
        else onPass()
      }, SWIPE_EXIT_MS)
    } else {
      setDragOffset(0)
    }
    pointerStart.current = null
    setIsDragging(false)
  }, [dragOffset, isExiting, onLike, onPass])

  useEffect(() => {
    const onTouchEnd = () => handleEnd()
    const onMouseUp = () => handleEnd()
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [handleEnd])

  const handleCardClick = useCallback(() => {
    if (!didMoveEnough.current && !isExiting) onOpen()
  }, [onOpen, isExiting])

  return (
    <div
      ref={cardRef}
      className="relative w-full"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX) }}
      onMouseMove={(e) => e.buttons === 1 && handleMove(e.clientX)}
    >
      <div
        className="relative transition-transform duration-200"
        style={{
          transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.03}deg)`,
          transition: isDragging ? 'none' : undefined,
        }}
      >
        <FeedCard
          event={event}
          reasons={reasons}
          onOpen={handleCardClick}
          showSwipeButtons
          onLike={() => { if (!isExiting) { setIsExiting('like'); setDragOffset(400); setTimeout(() => void Promise.resolve(onLike()).then(() => {}), SWIPE_EXIT_MS) } }}
          onPass={() => { if (!isExiting) { setIsExiting('pass'); setDragOffset(-400); setTimeout(onPass, SWIPE_EXIT_MS) } }}
        />
        {/* Swipe hints on card */}
        {!isExiting && isDragging && (
          <>
            {dragOffset > 30 && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-end pr-6 rounded-2xl border-4 border-emerald-500/80 bg-emerald-500/10">
                <span className="text-emerald-400 font-bold text-2xl">LIKE</span>
              </div>
            )}
            {dragOffset < -30 && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-start pl-6 rounded-2xl border-4 border-red-500/80 bg-red-500/10">
                <span className="text-red-400 font-bold text-2xl">PASS</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FeedCard({
  event,
  reasons,
  onOpen,
  showSwipeButtons = false,
  onLike,
  onPass,
}: {
  event: NormalizedEvent
  reasons: string[]
  onOpen: () => void
  showSwipeButtons?: boolean
  onLike?: () => void
  onPass?: () => void
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
      className="group rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-indigo-500/5 hover:border-slate-600 transition-all duration-300 cursor-pointer"
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
        {showSwipeButtons && (onPass != null || onLike != null) && (
          <div className="flex items-center justify-center gap-6 mb-4" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPass?.() }}
              className="w-14 h-14 rounded-full border-2 border-slate-500 bg-slate-800/80 text-slate-400 hover:border-red-400 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors shadow-lg"
              aria-label="Pass"
              title="Pass"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLike?.() }}
              className="w-14 h-14 rounded-full border-2 border-slate-500 bg-slate-800/80 text-slate-400 hover:border-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center transition-colors shadow-lg"
              aria-label="Like"
              title="Like"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>
        )}
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
