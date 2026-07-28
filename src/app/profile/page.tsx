'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { useUserActions } from '@/contexts/UserActionsContext'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import ProfileSupabaseSections from '@/components/ProfileSupabaseSections'
import ProfileEditForm from '@/components/ProfileEditForm'
import ProfileFriendsSection from '@/components/ProfileFriendsSection'
import ShareProfileButton from '@/components/ShareProfileButton'
import InviteToAppButton from '@/components/InviteToAppButton'
import PersonaManager from '@/components/PersonaManager'
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
}

interface Follow {
  id: string
  type: 'tag' | 'venue' | 'source' | 'artist'
  normalizedValue: string
  displayValue: string
  createdAt: string
}

interface NotificationSettings {
  emailEnabled: boolean
  digestFrequency: 'daily' | 'weekly' | 'never'
  instantEnabled: boolean
  timezone: string
}

interface SavedViewSummary {
  id: string
  name: string
  share_slug?: string
  is_public?: boolean
}

export default function ProfilePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const supabaseAuth = useSupabaseAuth()
  const supabaseUser = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const userActions = useUserActions()
  const [follows, setFollows] = useState<Follow[]>([])
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [savedViews, setSavedViews] = useState<SavedViewSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showImportPrompt, setShowImportPrompt] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const isSupabaseUser = supabaseConfigured && !!supabaseUser
  const isNextAuthUser = !supabaseConfigured && session?.user
  const isGuest = !supabaseConfigured && (session?.user as any)?.id === 'guest'
  const user = isSupabaseUser ? supabaseUser : session?.user

  useEffect(() => {
    setAvatarError(false)
  }, [profileData?.avatarUrl])

  useEffect(() => {
    if (!FEATURE_FLAGS.PROFILE_AUTH) {
      router.replace('/')
      return
    }
    if (!supabaseConfigured && status === 'loading') return

    if (!user) {
      router.push('/login')
      return
    }

    try {
      if (isSupabaseUser && userActions?.refetch) {
        userActions.refetch().catch(() => {})
      }
    } catch {
      // ignore refetch errors so page still renders
    }

    if (isSupabaseUser && supabaseUser) {
      let cancelled = false
      const loadProfile = async () => {
        const { supabase } = await import('@/lib/supabase/client')
        const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
        const headers: HeadersInit = { cache: 'no-store' }
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        const r = await fetch(`/api/users/${supabaseUser.id}/profile`, headers)
        if (cancelled) return
        if (r.ok) {
          const data = await r.json()
          if (!cancelled) setProfileData(data)
        }
      }
      loadProfile().finally(() => { if (!cancelled) setLoading(false) })
      return () => { cancelled = true }
    } else {
      loadFollows()
      loadSettings()
      if (!isGuest) {
        loadSavedViews()
      }
      checkForLocalViews()
    }
  }, [session, status, router, isGuest, supabaseConfigured, supabaseUser, user, isSupabaseUser])

  const loadFollows = async () => {
    if (!session?.user) return
    try {
      const response = await fetch('/api/follows')
      if (response.ok) {
        const { follows: followsData } = await response.json()
        setFollows(
          followsData.map((f: any) => ({
            id: f.id,
            type: f.type,
            normalizedValue: f.normalized_value,
            displayValue: f.display_value,
            createdAt: f.created_at,
          }))
        )
      }
    } catch (error) {
      console.error('Error loading follows:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSettings = async () => {
    if (!session?.user) return
    try {
      const response = await fetch('/api/notification-settings')
      if (response.ok) {
        const { settings: settingsData } = await response.json()
        setSettings({
          emailEnabled: settingsData.email_enabled,
          digestFrequency: settingsData.digest_frequency,
          instantEnabled: settingsData.instant_enabled,
          timezone: settingsData.timezone,
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const loadSavedViews = async () => {
    try {
      const res = await fetch('/api/saved-views')
      if (res.ok) {
        const { views } = await res.json()
        setSavedViews(
          views.map((v: any) => ({
            id: v.id,
            name: v.name,
            share_slug: v.share_slug,
            is_public: v.is_public,
          }))
        )
      }
    } catch (e) {
      console.error('Error loading saved views:', e)
    }
  }

  const checkForLocalViews = () => {
    const { getSavedViews } = require('@/lib/savedViews')
    const localViews = getSavedViews()
    if (localViews.length > 0 && !isGuest) {
      setShowImportPrompt(true)
    }
  }

  const handleImportLocalViews = async () => {
    const { importLocalViewsToDB } = require('@/lib/savedViewsSync')
    try {
      const imported = await importLocalViewsToDB()
      alert(`Imported ${imported} view(s) from local storage`)
      setShowImportPrompt(false)
      loadSavedViews()
    } catch (error) {
      console.error('Error importing views:', error)
      alert('Failed to import views')
    }
  }

  const handleDeleteFollow = async (id: string) => {
    if (!session?.user) return
    if (!confirm('Unfollow this item?')) return
    try {
      const response = await fetch(`/api/follows?id=${id}`, { method: 'DELETE' })
      if (response.ok) {
        setFollows((prev) => prev.filter((f) => f.id !== id))
      }
    } catch (error) {
      console.error('Error deleting follow:', error)
    }
  }

  const handleUpdateSettings = async (updates: Partial<NotificationSettings>) => {
    if (!session?.user || isGuest) return
    try {
      const response = await fetch('/api/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (response.ok) {
        const { settings: newSettings } = await response.json()
        setSettings({
          emailEnabled: newSettings.email_enabled,
          digestFrequency: newSettings.digest_frequency,
          instantEnabled: newSettings.instant_enabled,
          timezone: newSettings.timezone,
        })
      }
    } catch (error) {
      console.error('Error updating settings:', error)
    }
  }

  if ((!supabaseConfigured && status === 'loading') || loading) {
    return (
      <div className="min-h-screen bg-terminus-bg flex flex-col items-center justify-center gap-4 pt-24">
        <div className="text-terminus-fg-muted font-mono text-sm">Loading...</div>
        <a href="/calendar" className="terminus-link text-sm">Back to Calendar</a>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-terminus-bg flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-terminus-fg-muted">Sign in to view your profile.</p>
        <div className="flex gap-4">
          <a href="/calendar" className="terminus-link">Back to Calendar</a>
          <a href="/login" className="text-terminus-fg-muted hover:text-terminus-fg underline">Sign in</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-terminus-bg text-terminus-fg relative z-0 isolate pointer-events-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8 pt-2 pb-[calc(2rem+env(safe-area-inset-bottom))] relative z-10">
        <h1 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4 terminus-cursor">{'> PROFILE'}</h1>

        {/* Profile header with cover & avatar (Supabase) */}
        {isSupabaseUser && user && (
          <div className="mb-8 -mx-4 sm:-mx-6 md:-mx-8">
            {/* Cover only – no text on top (z-0 so avatar strip can sit on top) */}
            <div className="relative z-0 h-32 sm:h-40 md:h-48 bg-terminus-elevated overflow-hidden border-b-2 border-terminus-strong">
              <div className="absolute inset-0 bg-terminus-muted" />
              {profileData?.coverUrl && (
                <img
                  src={profileData.coverUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
            </div>
            {/* Name, username, bio and actions in a solid strip (z-10 so avatar overlaps on top of cover) */}
            <div className="relative z-10 bg-terminus-bg px-4 sm:px-6 md:px-8 pt-0 pb-5 border-b-2 border-terminus-border -mt-px">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                {profileData?.avatarUrl && !avatarError ? (
                  <img
                    src={profileData.avatarUrl}
                    alt=""
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-none border-4 border-terminus-bg object-cover bg-terminus-muted flex-shrink-0 -mt-14 sm:-mt-16"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-none border-4 border-terminus-bg bg-terminus-muted flex items-center justify-center text-3xl sm:text-4xl font-bold text-terminus-fg-muted flex-shrink-0 -mt-14 sm:-mt-16">
                    {(profileData?.displayName || user.name || user.email || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 pb-1 sm:pt-2">
                  <h2 className="text-2xl sm:text-3xl font-bold text-terminus-fg">
                    {profileData?.displayName || user.name || 'Profile'}
                  </h2>
                  {profileData?.username && (
                    <p className="text-terminus-fg-muted font-mono text-sm">@{profileData.username}</p>
                  )}
                  <div className="flex items-start gap-2 mt-2">
                    <p className="text-terminus-fg-muted text-sm max-w-xl flex-1">
                      {profileData?.bio || (
                        <span className="text-terminus-fg-faint italic">Add a bio...</span>
                      )}
                    </p>
                    <button
                      onClick={() => setShowEditForm(true)}
                      className="p-1 rounded-none text-terminus-fg-faint hover:text-terminus-fg hover:bg-terminus-muted transition-colors flex-shrink-0"
                      title="Edit bio"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-end flex-wrap">
                  <Link
                    href="/profile/settings"
                    className="p-2 rounded-none border-2 border-terminus-strong text-terminus-fg-muted hover:bg-terminus-muted hover:text-terminus-fg transition-colors"
                    title="Settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                  {profileData?.id && (
                    <ShareProfileButton
                      userId={profileData.id}
                      displayName={profileData.displayName || user?.name}
                      variant="button"
                    />
                  )}
                  <button
                    onClick={() => setShowEditForm(!showEditForm)}
                    className="terminus-btn text-xs uppercase tracking-wider px-4 py-2"
                  >
                    {showEditForm ? 'Cancel' : 'Edit profile'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Classic header (NextAuth / non-Supabase) */}
        {!isSupabaseUser && (
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-terminus-fg-muted space-y-1 font-mono text-sm">
              <div>
                Email: <span className="text-terminus-fg">{user.email}</span>
              </div>
              {user.name && (
                <div>
                  Name: <span className="text-terminus-fg">{user.name}</span>
                </div>
              )}
            </div>
            <Link
              href="/profile/settings"
              className="p-2 rounded-none border-2 border-terminus-strong text-terminus-fg-muted hover:bg-terminus-muted hover:text-terminus-fg transition-colors self-start"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        )}

        {/* Profile edit form (Supabase) */}
        {isSupabaseUser && showEditForm && user && (
          <div className="mb-8 p-6 terminus-panel">
            <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> EDIT'}</h2>
            <ProfileEditForm
              initialCoverUrl={profileData?.coverUrl}
              initialAvatarUrl={profileData?.avatarUrl}
              initialUsername={profileData?.username}
              initialBio={profileData?.bio}
              initialDisplayName={profileData?.displayName || user.name}
              onSaved={async (saved) => {
                setShowEditForm(false)
                if (saved && profileData) {
                  setProfileData({
                    ...profileData,
                    displayName: saved.displayName ?? profileData.displayName,
                    avatarUrl: saved.avatarUrl ?? profileData.avatarUrl,
                    coverUrl: saved.coverUrl ?? profileData.coverUrl,
                    bio: saved.bio ?? profileData.bio,
                    username: saved.username ?? profileData.username,
                  })
                } else if (supabaseUser) {
                  const { supabase } = await import('@/lib/supabase/client')
                  const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
                  const headers: HeadersInit = { cache: 'no-store' }
                  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
                  fetch(`/api/users/${supabaseUser.id}/profile`, headers)
                    .then((r) => (r.ok ? r.json() : null))
                    .then((data) => { if (data) setProfileData(data) })
                }
              }}
            />
          </div>
        )}

        {/* Friends section (Supabase) */}
        {isSupabaseUser && profileData && (
          <div className="mb-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg">{'> FRIENDS'}</h2>
              <InviteToAppButton variant="link" profileUserId={profileData.id} />
            </div>
            <ProfileFriendsSection
              userId={profileData.id}
              friendsCount={profileData.friendsCount ?? 0}
              isOwnProfile
              onFriendsCountChange={(count) =>
                setProfileData((prev) => (prev ? { ...prev, friendsCount: count } : prev))
              }
            />
          </div>
        )}

        {isGuest && !isSupabaseUser && (
          <div className="mb-6 p-4 terminus-panel">
            <p className="text-terminus-fg-muted text-sm">
              You're browsing as a guest. Sign in or create an account to save views, create personas, and follow venues or tags.
            </p>
            <Link
              href="/login"
              className="inline-block mt-3 px-4 py-2 terminus-btn terminus-btn-primary text-xs uppercase tracking-wider"
            >
              Sign in
            </Link>
          </div>
        )}

        {showImportPrompt && !isGuest && (
          <div className="mb-6 p-4 terminus-panel">
            <p className="mb-2 text-terminus-fg">You have saved views in local storage. Import them to your account?</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleImportLocalViews}
                className="min-h-[44px] px-4 py-2 terminus-btn terminus-btn-primary text-xs uppercase tracking-wider"
              >
                Import Views
              </button>
              <button onClick={() => setShowImportPrompt(false)} className="min-h-[44px] px-4 py-2 terminus-btn text-xs uppercase tracking-wider">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* My Saved Views (NextAuth only) */}
        {!isGuest && !isSupabaseUser && (
          <div className="mb-8">
            <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> SAVED VIEWS'}</h2>
            {savedViews.length === 0 ? (
              <p className="text-terminus-fg-faint">No saved views yet. Save views from the calendar sidebar.</p>
            ) : (
              <div className="space-y-2">
                {savedViews.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 terminus-panel hover:bg-terminus-muted transition-colors"
                  >
                    <Link href={`/calendar?viewId=${v.id}`} className="font-medium terminus-link">
                      {v.name}
                    </Link>
                    {v.is_public && v.share_slug && (
                      <Link href={`/v/${v.share_slug}`} className="text-xs text-terminus-fg-muted hover:text-terminus-fg">
                        Share link
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Personas (NextAuth) - manage and pick filters */}
        {!isGuest && !isSupabaseUser && FEATURE_FLAGS.PERSONAS && (
          <div className="mb-8">
            <PersonaManager />
          </div>
        )}

        {/* My Personas (Supabase) - same persona logic with Supabase auth */}
        {isSupabaseUser && FEATURE_FLAGS.PERSONAS && (
          <div className="mb-8">
            <PersonaManager
              getAuthHeaders={async (): Promise<Record<string, string>> => {
                const { supabase } = await import('@/lib/supabase/client')
                const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
                if (session?.access_token) {
                  return { Authorization: `Bearer ${session.access_token}` }
                }
                return {} as Record<string, string>
              }}
            />
          </div>
        )}

        {/* Supabase: Profile sections with venue cards, event sliders */}
        {isSupabaseUser && userActions && (
          <ProfileSupabaseSections
            followedVenueIds={userActions.actions.followedVenueIds}
            followedPromoterIds={userActions.actions.followedPromoterIds}
            wishlistedEventIds={userActions.actions.wishlistedEventIds}
            likedEventIds={userActions.actions.likedEventIds}
            goingIds={userActions.actions.goingIds}
            interestedIds={userActions.actions.interestedIds}
            onEventClick={(ev) => setSelectedEvent(ev)}
          />
        )}

        {/* Follows Section (NextAuth) */}
        {!isSupabaseUser && (
        <div className="mb-8">
          <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> FOLLOWS'}</h2>
          {follows.length === 0 ? (
            <p className="text-terminus-fg-faint">
              No follows yet. Follow venues from event cards or venue pages, and follow tags from event details.
            </p>
          ) : (
            <div className="space-y-2">
              {follows.map((follow) => (
                <div
                  key={follow.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 terminus-panel"
                >
                  <div>
                    <span className="text-xs text-terminus-fg-faint uppercase">{follow.type}</span>
                    <div className="font-medium text-terminus-fg">{follow.displayValue}</div>
                    <div className="text-sm text-terminus-fg-faint">{follow.normalizedValue}</div>
                  </div>
                  {!isGuest && (
                    <button
                      onClick={() => handleDeleteFollow(follow.id)}
                      className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 text-sm text-terminus-fg-muted hover:bg-terminus-muted rounded-none transition-colors self-start sm:self-center"
                    >
                      Unfollow
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Notification Settings (NextAuth only) */}
        {!isGuest && !isSupabaseUser && (
          <div className="mb-8">
            <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-5">{'> NOTIFICATIONS'}</h2>
            {settings && (
              <div className="space-y-5 p-4 sm:p-6 terminus-panel">
                <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-none hover:bg-terminus-muted transition-colors">
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={(e) => handleUpdateSettings({ emailEnabled: e.target.checked })}
                    className="rounded-none border-terminus-strong text-terminus-accent focus:ring-2 focus:ring-terminus-accent w-5 h-5 cursor-pointer bg-terminus-bg"
                  />
                  <span className="text-terminus-fg group-hover:text-terminus-fg font-medium">Enable email notifications</span>
                </label>

                <div>
                  <label className="block mb-2 text-sm font-medium text-terminus-fg-muted">Digest Frequency</label>
                  <select
                    value={settings.digestFrequency}
                    onChange={(e) => handleUpdateSettings({ digestFrequency: e.target.value as 'daily' | 'weekly' | 'never' })}
                    className="terminus-input"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="never">Never</option>
                  </select>
                </div>

                <label className="flex items-center gap-3 cursor-not-allowed p-3 rounded-none opacity-60">
                  <input type="checkbox" checked={settings.instantEnabled} disabled className="rounded-none border-terminus-strong w-5 h-5" />
                  <span className="text-terminus-fg-faint">Instant notifications (coming soon)</span>
                </label>

                <div>
                  <label className="block mb-2 text-sm font-medium text-terminus-fg-muted">Timezone</label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => handleUpdateSettings({ timezone: e.target.value })}
                    className="terminus-input"
                  >
                    <option value="Europe/Lisbon">Europe/Lisbon</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
