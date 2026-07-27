'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
import { EventImageThumb } from '@/components/EventImageGallery'
import EventModal from '@/app/calendar/components/EventModal'
import { logActivity } from '@/lib/activityLog'
import {
  setRecommendationSessionState,
  clearRecommendationImpressionCache,
  trackRecommendationImpression,
  trackRecommendationAction,
  type RecommendationItemMeta,
} from '@/lib/recommendationTelemetryClient'
import {
  RecommendationSessionProvider,
  type RecommendationSessionValue,
} from '@/contexts/RecommendationSessionContext'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import AuthGate from '@/components/AuthGate'
import {
  getLisbonRangeBounds,
  type TimeRangePreset,
} from '@/lib/lisbonDate'

const SWIPE_THRESHOLD = 80
const SWIPE_EXIT_MS = 250
/** Genuine impression: active card visible continuously for this long */
const IMPRESSION_VISIBLE_MS = 1000

const FORYOU_RANGES: { id: TimeRangePreset; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

function SkeletonCard() {
  return (
    <div className="rounded-none bg-pager-elevated border border-pager-border overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-pager-muted" />
      <div className="p-5 space-y-3">
        <div className="h-6 bg-pager-muted rounded w-3/4" />
        <div className="h-4 bg-pager-muted rounded w-1/2" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-16 bg-pager-muted rounded-none" />
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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [algorithmVersion, setAlgorithmVersion] = useState('rules_v1')
  const [telemetryEnabled, setTelemetryEnabled] = useState(false)
  const [recommendationItems, setRecommendationItems] = useState<RecommendationItemMeta[]>([])
  const [passedIds, setPassedIds] = useState<Set<string>>(() => new Set())
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('all')

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
      const items: RecommendationItemMeta[] = Array.isArray(data.recommendationItems)
        ? data.recommendationItems
        : []

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

      const nextSessionId =
        typeof data.recommendationSessionId === 'string' ? data.recommendationSessionId : null
      const nextTelemetry = data.telemetryEnabled === true
      const nextAlgo =
        typeof data.algorithmVersion === 'string' ? data.algorithmVersion : 'rules_v1'

      clearRecommendationImpressionCache()
      setRecommendationSessionState({
        sessionId: nextSessionId,
        algorithmVersion: nextAlgo,
        telemetryEnabled: nextTelemetry,
        items,
      })
      setSessionId(nextSessionId)
      setAlgorithmVersion(nextAlgo)
      setTelemetryEnabled(nextTelemetry)
      setRecommendationItems(items)
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

  const visibleEvents = useMemo(() => {
    const bounds = getLisbonRangeBounds(timeRange)
    return events.filter((e) => {
      if (passedIds.has(e.id)) return false
      if (!bounds) return true
      const t = new Date(e.start).getTime()
      return t >= bounds.start.getTime() && t <= bounds.end.getTime()
    })
  }, [events, passedIds, timeRange])

  // Genuine impression: only the active swipe card, after continuous visibility threshold
  useEffect(() => {
    if (!telemetryEnabled || !sessionId) return
    if (currentCardIndex < 0 || currentCardIndex >= visibleEvents.length) return
    const eventId = visibleEvents[currentCardIndex]?.id
    if (!eventId) return

    const timer = setTimeout(() => {
      trackRecommendationImpression(eventId)
    }, IMPRESSION_VISIBLE_MS)

    return () => clearTimeout(timer)
  }, [currentCardIndex, visibleEvents, sessionId, telemetryEnabled])

  const sessionValue: RecommendationSessionValue = useMemo(
    () => ({
      sessionId,
      algorithmVersion,
      telemetryEnabled,
      itemsByEventId: new Map(recommendationItems.map((i) => [i.eventId, i])),
    }),
    [sessionId, algorithmVersion, telemetryEnabled, recommendationItems]
  )

  const activeEvent = currentCardIndex < visibleEvents.length ? visibleEvents[currentCardIndex] : null

  useEffect(() => {
    setCurrentCardIndex(0)
  }, [timeRange])

  const advanceCard = useCallback(() => {
    setCurrentCardIndex((i) => i + 1)
  }, [])

  const handlePass = useCallback(
    (eventId: string) => {
      trackRecommendationAction('pass', eventId)
      setPassedIds((prev) => {
        const next = new Set(prev)
        next.add(eventId)
        return next
      })
      advanceCard()
    },
    [advanceCard]
  )

  const handleLike = useCallback(
    async (event: NormalizedEvent) => {
      if (actions) {
        const ok = await actions.likeEvent(event.id)
        if (ok) trackRecommendationAction('like', event.id)
      }
      advanceCard()
    },
    [actions, advanceCard]
  )

  return (
    <RecommendationSessionProvider value={sessionValue}>
      <div className="min-h-screen bg-pager-bg pb-28">
        <div className="max-w-2xl mx-auto px-4 pt-16 sm:pt-20">
          <header className="mb-6 sm:mb-8">
            <h1 className="pager-heading mb-3">FOR YOU</h1>
            <p className="text-pager-fg-muted text-sm sm:text-base max-w-md leading-relaxed">
              Your personal event feed — venues you follow, promoters, personas, and friends. Swipe to like or pass.
            </p>
            <div className="mt-4 flex border-2 border-pager-border overflow-x-auto">
              {FORYOU_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTimeRange(r.id)}
                  className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wider whitespace-nowrap ${
                    timeRange === r.id
                      ? 'bg-pager-accent text-pager-accent-fg'
                      : 'text-pager-fg-muted hover:text-pager-fg hover:bg-pager-muted'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </header>

          {loading && events.length === 0 ? (
            <div className="space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : visibleEvents.length > 0 || (events.length > 0 && currentCardIndex < visibleEvents.length) ? (
            <div className="relative" style={{ minHeight: '420px' }}>
              {currentCardIndex + 1 < visibleEvents.length && (
                <div className="absolute inset-0 top-2 left-1 right-1 scale-[0.96] opacity-90 pointer-events-none" aria-hidden>
                  <FeedCard
                    event={visibleEvents[currentCardIndex + 1]}
                    reasons={reasons[visibleEvents[currentCardIndex + 1].id] || []}
                    onOpen={() => {}}
                    showSwipeButtons={false}
                  />
                </div>
              )}
              {activeEvent && (
                <SwipeableFeedCard
                  key={activeEvent.id}
                  event={activeEvent}
                  reasons={reasons[activeEvent.id] || []}
                  onOpen={() => {
                    setSelectedEvent(activeEvent)
                    logActivity('view_event_modal', 'event', activeEvent.id, { title: activeEvent.title })
                  }}
                  onLike={() => handleLike(activeEvent)}
                  onPass={() => handlePass(activeEvent.id)}
                  likeNeedsAuth={!user}
                  onHide={
                    FEATURE_FLAGS.RECOMMENDATION_HIDE
                      ? () => {
                          trackRecommendationAction('hide', activeEvent.id)
                          setPassedIds((prev) => {
                            const next = new Set(prev)
                            next.add(activeEvent.id)
                            return next
                          })
                          advanceCard()
                        }
                      : undefined
                  }
                />
              )}
              {!loading && !activeEvent && events.length > 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-none border border-pager-border bg-pager-elevated/30 backdrop-blur-sm py-12">
                  <p className="text-pager-fg-muted text-lg font-medium">You&apos;re all caught up</p>
                  <p className="text-pager-fg-faint text-sm mt-1">Come back later for more events</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPassedIds(new Set())
                      setCurrentCardIndex(0)
                    }}
                    className="mt-6 px-5 py-2.5 rounded-none bg-pager-accent text-pager-accent-fg font-medium transition-colors"
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
            reasons={selectedEvent ? reasons[selectedEvent.id] || [] : undefined}
          />

          {!loading && events.length === 0 && <EmptyState />}
        </div>
      </div>
    </RecommendationSessionProvider>
  )
}

function EmptyState() {
  return (
    <div className="rounded-none border border-pager-border bg-pager-elevated/30 backdrop-blur-sm p-8 sm:p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-none bg-gradient-to-br from-indigo-500/20 to-purple-500/20 mb-6">
        <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-pager-fg mb-2">Your feed is waiting</h2>
      <p className="text-pager-fg-muted text-sm sm:text-base max-w-sm mx-auto mb-6 leading-relaxed">
        Follow venues and promoters, create personas, and we&apos;ll surface events you&apos;ll love. Your friends&apos; picks will show up too.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/calendar"
          className="inline-flex items-center justify-center px-5 py-2.5 pager-btn pager-btn-primary text-xs uppercase tracking-wider"
        >
          Browse calendar
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-none border border-pager-border text-pager-fg-muted font-medium hover:bg-pager-elevated/50 hover:border-slate-500 transition-all"
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
  onHide,
  likeNeedsAuth = false,
}: {
  event: NormalizedEvent
  reasons: string[]
  onOpen: () => void
  onLike: () => void | Promise<void>
  onPass: () => void
  onHide?: () => void
  likeNeedsAuth?: boolean
}) {
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

  const triggerLike = () => {
    if (isExiting) return
    setIsExiting('like')
    setDragOffset(400)
    setTimeout(() => void Promise.resolve(onLike()).then(() => {}), SWIPE_EXIT_MS)
  }

  const triggerPass = () => {
    if (isExiting) return
    setIsExiting('pass')
    setDragOffset(-400)
    setTimeout(onPass, SWIPE_EXIT_MS)
  }

  return (
    <div className="relative w-full" style={{ touchAction: 'pan-y' }}>
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
          likeNeedsAuth={likeNeedsAuth}
          onDragStart={handleStart}
          onDragMove={handleMove}
          onLike={triggerLike}
          onPass={triggerPass}
          onHide={onHide}
        />
        {!isExiting && isDragging && (
          <>
            {dragOffset > 30 && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-end pr-6 rounded-none border-4 border-emerald-500/80 bg-emerald-500/10">
                <span className="text-emerald-400 font-bold text-2xl">LIKE</span>
              </div>
            )}
            {dragOffset < -30 && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-start pl-6 rounded-none border-4 border-red-500/80 bg-red-500/10">
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
  onHide,
  likeNeedsAuth = false,
  onDragStart,
  onDragMove,
}: {
  event: NormalizedEvent
  reasons: string[]
  onOpen: () => void
  showSwipeButtons?: boolean
  onLike?: () => void
  onPass?: () => void
  onHide?: () => void
  likeNeedsAuth?: boolean
  onDragStart?: (clientX: number) => void
  onDragMove?: (clientX: number) => void
}) {
  const p = event.extendedProps
  const start = new Date(event.start)
  const categoryColor = getCategoryColor(p.category)
  const priceLabel = p.isFree === true
    ? 'Free'
    : p.priceMin !== undefined && p.priceMax !== undefined
      ? `${p.priceMin === p.priceMax ? p.priceMin : `${p.priceMin}–${p.priceMax}`} €`
      : p.priceMin !== undefined
        ? `From ${p.priceMin} €`
        : null

  const descriptionText = (p.descriptionLong && p.descriptionLong.trim().length > 0)
    ? p.descriptionLong.trim()
    : (p.descriptionShort && p.descriptionShort.trim().length > 0)
      ? p.descriptionShort.trim()
      : null

  const likeButton = (
    <button
      type="button"
      onMouseDown={(e) => { e.stopPropagation() }}
      onTouchStart={(e) => { e.stopPropagation() }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLike?.() }}
      className="w-14 h-14 sm:w-14 sm:h-14 rounded-none border-2 border-slate-500 bg-pager-elevated/80 text-pager-fg-muted hover:border-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center transition-colors shadow-lg flex-shrink-0"
      aria-label="Like"
      title="Like"
    >
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    </button>
  )

  return (
    <article
      className="group rounded-none bg-pager-elevated border border-pager-border overflow-hidden shadow-xl hover:shadow-2xl hover:border-pager-border transition-all duration-300 cursor-pointer"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div
        className="aspect-[4/3] relative bg-pager-elevated overflow-hidden"
        onTouchStart={(e) => onDragStart?.(e.touches[0].clientX)}
        onTouchMove={(e) => onDragMove?.(e.touches[0].clientX)}
        onMouseDown={(e) => { onDragStart?.(e.clientX) }}
        onMouseMove={(e) => e.buttons === 1 && onDragMove?.(e.clientX)}
      >
        <EventImageThumb
          imageUrl={p.imageUrl}
          imageUrls={p.imageUrls}
          alt={event.title}
          className="absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-1.5">
          {reasons.slice(0, 3).map((r) => (
            <span key={r} className="px-2.5 py-1 rounded-none text-xs font-medium bg-white/15 text-white backdrop-blur-md border border-white/10">{r}</span>
          ))}
          {p.isFree === true && (
            <span className="px-2.5 py-1 rounded-none text-xs font-semibold bg-emerald-500/90 text-white">Free</span>
          )}
        </div>
        {priceLabel && p.isFree !== true && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-none text-xs font-medium bg-black/50 text-pager-fg backdrop-blur-sm">{priceLabel}</div>
        )}
        <div className="absolute bottom-3 left-3 right-3">
          <h2 className="font-bold text-white text-lg sm:text-xl line-clamp-2 drop-shadow-lg">{event.title}</h2>
          <p className="text-pager-fg/90 text-sm sm:text-base mt-0.5 truncate">{p.venueName || 'TBA'}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5 min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base sm:text-sm mb-3">
          <time dateTime={event.start} className="text-pager-fg-muted font-medium tabular-nums">
            {start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })}
          </time>
          {p.category && (
            <span className="px-2 py-0.5 rounded-none text-xs border" style={{ borderColor: categoryColor, color: categoryColor }}>{p.category}</span>
          )}
        </div>
        {descriptionText && (
          <p className="text-pager-fg-muted text-base sm:text-sm leading-relaxed line-clamp-4 mb-4">{descriptionText}</p>
        )}
        {showSwipeButtons && (onPass != null || onLike != null) && (
          <div className="flex items-center justify-center gap-8 sm:gap-6 mb-5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onMouseDown={(e) => { e.stopPropagation() }}
              onTouchStart={(e) => { e.stopPropagation() }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPass?.() }}
              className="w-14 h-14 rounded-none border-2 border-slate-500 bg-pager-elevated/80 text-pager-fg-muted hover:border-red-400 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors shadow-lg flex-shrink-0"
              aria-label="Pass"
              title="Pass"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {likeNeedsAuth ? (
              <AuthGate action="likeEvent" id={event.id} displayName={event.title} asWrapper onAction={() => onLike?.()}>
                {likeButton}
              </AuthGate>
            ) : (
              likeButton
            )}
            {onHide && (
              <button
                type="button"
                onMouseDown={(e) => { e.stopPropagation() }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide() }}
                className="text-xs text-pager-fg-faint hover:text-pager-fg-muted underline"
                aria-label="Hide event"
                title="Hide"
              >
                Hide
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-2">
            {p.venueId && <FollowVenueButton venueId={p.venueId} displayName={p.venueName || p.venueId} showContextLabel size="md" variant="default" />}
            {p.promoterId && <FollowPromoterButton promoterId={p.promoterId} displayName={p.promoterName || p.promoterId} showContextLabel size="md" />}
          </div>
          <div className="flex items-center gap-1">
            <EventCounts eventId={event.id} />
            <EventLikeCount eventId={event.id} />
            <EventActionButtons eventId={event.id} eventTitle={event.title} eventStart={event.start} compact shareMenuPlacement="top" />
          </div>
        </div>
      </div>
    </article>
  )
}
