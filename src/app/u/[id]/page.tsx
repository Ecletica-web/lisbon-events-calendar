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

  // Close image preview when navigating to a different profile
  useEffect(() => {
    setImagePreviewUrl(null)
  }, [id])

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('Invalid profile')
      return
    }
    let cancelled = false
    async function load() {
      try {
        const profileRes = await fetch(`/api/users/${id}/profile`)
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    )
  }

  if (error && !profileData && !publicData) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-slate-300">{error}</p>
        <div className="flex gap-4">
          <Link href="/calendar" className="text-indigo-400 hover:underline">Back to Calendar</Link>
          <Link href="/profile" className="text-slate-400 hover:underline">My profile</Link>
        </div>
      </div>
    )
  }

  const closeImagePreview = useCallback(() => setImagePreviewUrl(null), [])

  useEffect(() => {
    if (!imagePreviewUrl) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeImagePreview() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [imagePreviewUrl, closeImagePreview])

  if (mode === 'profile' && profileData) {
    const isOwnProfile = currentUser?.id === profileData.id
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
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
              className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={closeImagePreview}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/90 text-slate-200 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              aria-label="Close preview"
            >
              <span className="sr-only">Close</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="max-w-2xl mx-auto">
          <div className="px-4 sm:px-6 pt-2 pb-1">
            <Link href="/calendar" className="text-slate-400 hover:text-indigo-400 text-sm">← Back to Calendar</Link>
          </div>
          <div className="-mx-4 sm:-mx-6 md:0 -mt-0">
            <div className="relative h-40 sm:h-48 bg-slate-800 overflow-hidden rounded-b-[3rem] sm:rounded-b-[4rem]">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/50 via-purple-900/50 to-pink-900/50" />
              {profileData.coverUrl && (
                <button
                  type="button"
                  onClick={() => setImagePreviewUrl(profileData.coverUrl!)}
                  className="absolute inset-0 w-full h-full block focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400"
                >
                  <img
                    src={profileData.coverUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                </button>
              )}
            </div>
            <div className="relative px-4 sm:px-6 md:px-8 -mt-20">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                {profileData.avatarUrl ? (
                  <button
                    type="button"
                    onClick={() => setImagePreviewUrl(profileData.avatarUrl!)}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-900 overflow-hidden flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                  >
                    <img
                      src={profileData.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover bg-slate-700"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        const fallback = e.currentTarget.closest('button')?.nextElementSibling
                        if (fallback instanceof HTMLElement) fallback.classList.remove('hidden')
                      }}
                    />
                  </button>
                ) : null}
                <div
                  className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-900 bg-slate-700 flex items-center justify-center text-3xl sm:text-4xl font-bold text-slate-400 flex-shrink-0 ${profileData.avatarUrl ? 'hidden' : ''}`}
                >
                  {(profileData.displayName || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 pb-1">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">
                    {profileData.displayName || 'User'}
                  </h1>
                  {profileData.username && (
                    <p className="text-slate-400">@{profileData.username}</p>
                  )}
                  {profileData.bio && (
                    <p className="text-slate-300 mt-2 text-sm max-w-xl">{profileData.bio}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <ShareProfileButton
                      userId={profileData.id}
                      displayName={profileData.displayName}
                      variant="button"
                    />
                    {!isOwnProfile && <AddFriendButton targetUserId={profileData.id} />}
                  </div>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6 md:p-8 pt-4">
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-slate-200">Friends</h2>
              <ProfileFriendsSection
                userId={profileData.id}
                friendsCount={profileData.friendsCount ?? 0}
                isOwnProfile={false}
                onFriendsCountChange={(count) => setProfileData((prev) => prev ? { ...prev, friendsCount: count } : prev)}
              />
            </div>
            {eventsData && eventsData.visible && (eventsData.upcoming.length > 0 || eventsData.past.length > 0) && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4 text-slate-200">Events</h2>
                {eventsData.upcoming.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-slate-400 uppercase mb-3">Upcoming</h3>
                    <ul className="space-y-2">
                      {eventsData.upcoming.slice(0, 10).map((e) => (
                        <li key={e.id}>
                          <button
                            onClick={() => setSelectedEvent(e)}
                            className="w-full text-left p-3 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800 transition-colors"
                          >
                            <span className="font-medium text-slate-200">{e.title}</span>
                            <span className="text-slate-400 text-sm block mt-1">
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
                    <h3 className="text-sm font-medium text-slate-400 uppercase mb-3">Past</h3>
                    <ul className="space-y-2">
                      {eventsData.past.slice(0, 10).map((e) => (
                        <li key={e.id}>
                          <button
                            onClick={() => setSelectedEvent(e)}
                            className="w-full text-left p-3 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800 transition-colors"
                          >
                            <span className="font-medium text-slate-200">{e.title}</span>
                            <span className="text-slate-400 text-sm block mt-1">
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
              <p className="text-slate-500 text-sm mb-8">No events yet.</p>
            )}
            <Link href="/calendar" className="text-indigo-400 hover:underline">← Back to Calendar</Link>
          </div>
        </div>
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      </div>
    )
  }

  if (mode === 'public' && publicData) {
    const displayName = publicData.userName || publicData.userId
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <div className="max-w-2xl mx-auto p-6 pt-24">
          <h1 className="text-2xl font-bold mb-2">@{displayName}</h1>
          <p className="text-slate-400 text-sm mb-8">Public views and personas</p>

          {publicData.publicViews.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Shared Views</h2>
              <ul className="space-y-2">
                {publicData.publicViews.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/v/${v.share_slug}`}
                      className="block p-3 rounded-lg border border-slate-700 hover:border-indigo-500 hover:bg-slate-800/50 transition-colors"
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
              <h2 className="text-lg font-semibold mb-3">Personas</h2>
              <ul className="space-y-2">
                {publicData.publicPersonas.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/p/${p.share_slug}`}
                      className="block p-3 rounded-lg border border-slate-700 hover:border-indigo-500 hover:bg-slate-800/50 transition-colors"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {publicData.publicViews.length === 0 && publicData.publicPersonas.length === 0 && (
            <p className="text-slate-500">No public views or personas yet.</p>
          )}

          <div className="mt-8">
            <Link href="/calendar" className="text-indigo-400 hover:underline">
              ← Back to Calendar
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-4">
      <p className="text-slate-300">Not found</p>
      <Link href="/calendar" className="text-indigo-400 hover:underline">Go home</Link>
    </div>
  )
}
