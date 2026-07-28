'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import AddFriendButton from '@/components/AddFriendButton'
import ShareProfileButton from '@/components/ShareProfileButton'
import ProfileFriendsSection from '@/components/ProfileFriendsSection'
import EventModal from '@/app/calendar/components/EventModal'
import type { NormalizedEvent } from '@/lib/eventsAdapter'

interface ProfileData {
  id: string
  displayName?: string | null
  avatarUrl?: string | null
  bio?: string | null
  username?: string | null
  coverUrl?: string | null
  friendsCount?: number
  eventVisibility?: 'public' | 'friends_only'
  isPrivate?: boolean
  friendsListPrivate?: boolean
}

interface PublicProfileData {
  userId: string
  userName?: string
  publicViews: { id: string; name: string; share_slug: string }[]
  publicPersonas: { id: string; title: string; share_slug: string }[]
}

export default function PublicProfilePage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const supabaseAuth = useSupabaseAuth()
  const currentUser = supabaseAuth?.user
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [publicData, setPublicData] = useState<PublicProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'profile' | 'public' | null>(null)
  const [eventsData, setEventsData] = useState<{ upcoming: NormalizedEvent[]; past: NormalizedEvent[]; visible: boolean } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  const closeImagePreview = useCallback(() => setImagePreviewUrl(null), [])

  // Close image preview when navigating to a different profile
  useEffect(() => {
    setImagePreviewUrl(null)
  }, [id])

  // Escape key to close image preview (must run every render for hook count consistency)
  useEffect(() => {
    if (!imagePreviewUrl) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeImagePreview() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [imagePreviewUrl, closeImagePreview])

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('Invalid profile')
      return
    }
    let cancelled = false
    async function load() {
      try {
        const headers: HeadersInit = {}
        const { supabase } = await import('@/lib/supabase/client')
        const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        const profileRes = await fetch(`/api/users/${id}/profile`, { headers })
        if (cancelled) return
        if (profileRes.ok) {
          const json = await profileRes.json()
          if (cancelled) return
          setProfileData(json)
          setMode('profile')
          setLoading(false)
          return
        }
        if (FEATURE_FLAGS.SHARED_VIEWS) {
          const publicRes = await fetch(`/api/users/${id}/public`)
          if (cancelled) return
          if (publicRes.ok) {
            const json = await publicRes.json()
            if (cancelled) return
            setPublicData(json)
            setMode('public')
          } else {
            setError('Profile not found')
          }
        } else {
          setError('Profile not found')
        }
      } catch {
        if (!cancelled) setError('Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!id || !profileData || mode !== 'profile') return
    let cancelled = false
    async function loadEvents() {
      try {
        const { supabase } = await import('@/lib/supabase/client')
        const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
        const headers: Record<string, string> = {}
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        const res = await fetch(`/api/users/${id}/events`, { headers })
        if (cancelled) return
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setEventsData({ upcoming: data.upcoming ?? [], past: data.past ?? [], visible: data.visible ?? false })
      } catch {
        if (!cancelled) setEventsData({ upcoming: [], past: [], visible: false })
      }
    }
    loadEvents()
    return () => { cancelled = true }
  }, [id, profileData, mode])

  if (loading) {
    return (
      <div className="min-h-screen bg-terminus-bg flex items-center justify-center">
        <div className="text-terminus-fg-muted">Loading...</div>
      </div>
    )
  }

  if (error && !profileData && !publicData) {
    return (
      <div className="min-h-screen bg-terminus-bg flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-terminus-fg-muted">{error}</p>
        <div className="flex gap-4">
          <a href="/calendar" className="terminus-link">Back to Calendar</a>
          <a href="/profile" className="text-terminus-fg-muted hover:underline">My profile</a>
        </div>
      </div>
    )
  }

  if (mode === 'profile' && profileData) {
    const isOwnProfile = currentUser?.id === profileData.id
    if (profileData.isPrivate && !isOwnProfile) {
      return (
        <div className="min-h-screen bg-terminus-bg flex flex-col items-center justify-center p-6">
          <div className="terminus-panel p-8 max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-none border-2 border-terminus-strong bg-terminus-muted flex items-center justify-center">
              <svg className="w-8 h-8 text-terminus-fg-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-2">{'> PRIVATE'}</h1>
            <p className="text-terminus-fg-muted text-sm">This user has set their profile to private. You can&apos;t see their info.</p>
            <Link href="/calendar" className="mt-6 inline-block terminus-link font-medium">Back to Calendar</Link>
          </div>
        </div>
      )
    }
    const showFriends = isOwnProfile || !profileData.friendsListPrivate
    return (
      <div className="min-h-screen bg-terminus-bg text-terminus-fg">
        {imagePreviewUrl && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80"
            onClick={closeImagePreview}
          >
            <img
              src={imagePreviewUrl}
              alt=""
              className="max-w-full max-h-full object-contain rounded-none border-2 border-terminus-strong"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={closeImagePreview}
              className="absolute top-4 right-4 p-2 rounded-none border-2 border-terminus-strong bg-terminus-elevated text-terminus-fg hover:bg-terminus-muted focus:outline-none focus:ring-2 focus:ring-terminus-accent"
              aria-label="Close preview"
            >
              <span className="sr-only">Close</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="max-w-2xl mx-auto p-4 sm:p-6 md:p-8 pt-2">
          <h1 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4 terminus-cursor">{'> PROFILE'}</h1>
          <div className="-mx-4 sm:-mx-6 md:-mx-8">
            {/* Cover (z-0 so avatar strip sits on top) */}
            <div className="relative z-0 h-32 sm:h-40 md:h-48 bg-terminus-elevated overflow-hidden border-b-2 border-terminus-strong">
              <div className="absolute inset-0 bg-terminus-muted" />
              {profileData.coverUrl && (
                <button
                  type="button"
                  onClick={() => setImagePreviewUrl(profileData.coverUrl!)}
                  className="absolute inset-0 w-full h-full block focus:outline-none focus:ring-2 focus:ring-inset focus:ring-terminus-accent"
                >
                  <img
                    src={profileData.coverUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                </button>
              )}
            </div>
            {/* Strip: avatar + name + actions (z-10 so avatar overlaps on top of cover) */}
            <div className="relative z-10 bg-terminus-bg px-4 sm:px-6 md:px-8 pt-0 pb-5 border-b-2 border-terminus-border -mt-px">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                {/* Single avatar slot: image or initial — square, matches /profile */}
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-none border-4 border-terminus-bg bg-terminus-muted flex-shrink-0 -mt-14 sm:-mt-16 overflow-hidden flex items-center justify-center">
                  {profileData.avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => setImagePreviewUrl(profileData.avatarUrl!)}
                      className="absolute inset-0 w-full h-full focus:outline-none focus:ring-2 focus:ring-terminus-accent focus:ring-offset-2 focus:ring-offset-terminus-bg rounded-none"
                    >
                      <img
                        src={profileData.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const wrap = e.currentTarget.closest('div')
                          const fallback = wrap?.querySelector('[data-avatar-fallback]')
                          if (fallback instanceof HTMLElement) fallback.classList.remove('hidden')
                        }}
                      />
                    </button>
                  ) : null}
                  <span
                    data-avatar-fallback
                    className={`text-3xl sm:text-4xl font-bold text-terminus-fg-muted ${profileData.avatarUrl ? 'hidden' : ''}`}
                  >
                    {(profileData.displayName || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 pb-1 min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-bold text-terminus-fg truncate">
                    {profileData.displayName || 'User'}
                  </h2>
                  {profileData.username && (
                    <p className="text-terminus-fg-muted font-mono text-sm">@{profileData.username}</p>
                  )}
                  {profileData.bio && (
                    <p className="text-terminus-fg-muted mt-2 text-sm max-w-xl">{profileData.bio}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap self-start sm:self-end">
                  <ShareProfileButton
                    userId={profileData.id}
                    displayName={profileData.displayName}
                    variant="button"
                  />
                  {!isOwnProfile && currentUser && (
                    <Link
                      href={`/chat?with=${encodeURIComponent(profileData.id)}`}
                      className="inline-flex items-center gap-2 px-3 py-2 terminus-btn text-xs uppercase tracking-wider"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Send message
                    </Link>
                  )}
                  {!isOwnProfile && <AddFriendButton targetUserId={profileData.id} />}
                </div>
              </div>
            </div>
          </div>
          <div className="pt-6">
            {showFriends && (
              <div className="mb-8">
                <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> FRIENDS'}</h2>
                <ProfileFriendsSection
                  userId={profileData.id}
                  friendsCount={profileData.friendsCount ?? 0}
                  isOwnProfile={isOwnProfile}
                  onFriendsCountChange={(count) => setProfileData((prev) => prev ? { ...prev, friendsCount: count } : prev)}
                />
              </div>
            )}
            {eventsData && eventsData.visible && (eventsData.upcoming.length > 0 || eventsData.past.length > 0) && (
              <div className="mb-8">
                <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> EVENTS'}</h2>
                {eventsData.upcoming.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-medium text-terminus-fg-muted uppercase tracking-wider mb-3">Upcoming</h3>
                    <ul className="space-y-2">
                      {eventsData.upcoming.slice(0, 10).map((e) => (
                        <li key={e.id}>
                          <button
                            onClick={() => setSelectedEvent(e)}
                            className="w-full text-left p-3 terminus-panel hover:bg-terminus-muted transition-colors"
                          >
                            <span className="font-medium text-terminus-fg">{e.title}</span>
                            <span className="text-terminus-fg-muted text-sm block mt-1">
                              {e.start ? new Date(e.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {eventsData.past.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-terminus-fg-muted uppercase tracking-wider mb-3">Past</h3>
                    <ul className="space-y-2">
                      {eventsData.past.slice(0, 10).map((e) => (
                        <li key={e.id}>
                          <button
                            onClick={() => setSelectedEvent(e)}
                            className="w-full text-left p-3 terminus-panel hover:bg-terminus-muted transition-colors"
                          >
                            <span className="font-medium text-terminus-fg">{e.title}</span>
                            <span className="text-terminus-fg-muted text-sm block mt-1">
                              {e.start ? new Date(e.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {eventsData && eventsData.visible && eventsData.upcoming.length === 0 && eventsData.past.length === 0 && (
              <p className="text-terminus-fg-faint text-sm mb-8">No events yet.</p>
            )}
            <a href="/calendar" className="terminus-link">← Back to Calendar</a>
          </div>
        </div>
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      </div>
    )
  }

  if (mode === 'public' && publicData) {
    const displayName = publicData.userName || publicData.userId
    return (
      <div className="min-h-screen bg-terminus-bg text-terminus-fg">
        <div className="max-w-2xl mx-auto p-6 pt-24">
          <h1 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-2">{'> PROFILE'}</h1>
          <p className="text-terminus-fg font-mono text-sm mb-1">@{displayName}</p>
          <p className="text-terminus-fg-muted text-sm mb-8">Public views and personas</p>

          {publicData.publicViews.length > 0 && (
            <section className="mb-8">
              <h2 className="font-pixel text-[10px] text-terminus-fg mb-3">{'> SHARED VIEWS'}</h2>
              <ul className="space-y-2">
                {publicData.publicViews.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/v/${v.share_slug}`}
                      className="block p-3 terminus-panel hover:bg-terminus-muted transition-colors"
                    >
                      {v.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {publicData.publicPersonas.length > 0 && (
            <section className="mb-8">
              <h2 className="font-pixel text-[10px] text-terminus-fg mb-3">{'> PERSONAS'}</h2>
              <ul className="space-y-2">
                {publicData.publicPersonas.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/p/${p.share_slug}`}
                      className="block p-3 terminus-panel hover:bg-terminus-muted transition-colors"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {publicData.publicViews.length === 0 && publicData.publicPersonas.length === 0 && (
            <p className="text-terminus-fg-faint">No public views or personas yet.</p>
          )}

          <div className="mt-8">
            <a href="/calendar" className="terminus-link">
              ← Back to Calendar
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-terminus-bg flex flex-col items-center justify-center gap-4 p-4">
      <p className="text-terminus-fg-muted">Not found</p>
      <a href="/calendar" className="terminus-link">Go home</a>
    </div>
  )
}
