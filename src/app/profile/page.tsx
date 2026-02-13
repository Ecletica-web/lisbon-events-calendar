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
  followersCount: number
  followingCount: number
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
  const isSupabaseUser = supabaseConfigured && !!supabaseUser
  const isNextAuthUser = !supabaseConfigured && session?.user
  const isGuest = !supabaseConfigured && (session?.user as any)?.id === 'guest'
  const user = isSupabaseUser ? supabaseUser : session?.user

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

    if (isSupabaseUser && supabaseUser) {
      fetch(`/api/users/${supabaseUser.id}/profile`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setProfileData(data)
        })
        .finally(() => setLoading(false))
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center pt-24">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-900/95 text-slate-100">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8 pt-20 md:pt-28 pb-8">
        {/* Profile header with cover & avatar (Supabase) */}
        {isSupabaseUser && user && (
          <div className="mb-8 -mx-4 sm:-mx-6 md:-mx-8">
            <div className="relative h-32 sm:h-40 md:h-48 bg-slate-800 overflow-hidden rounded-b-[3rem] sm:rounded-b-[4rem]">
              {profileData?.coverUrl ? (
                <img
                  src={profileData.coverUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/50 via-purple-900/50 to-pink-900/50" />
              )}
            </div>
            <div className="relative px-4 sm:px-6 md:px-8 -mt-16 sm:-mt-20">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                {profileData?.avatarUrl ? (
                  <img
                    src={profileData.avatarUrl}
                    alt=""
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-900 object-cover bg-slate-700"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-900 bg-slate-700 flex items-center justify-center text-3xl sm:text-4xl font-bold text-slate-400">
                    {(profileData?.displayName || user.name || user.email || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 pb-1">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">
                    {profileData?.displayName || user.name || 'Profile'}
                  </h1>
                  {profileData?.username && (
                    <p className="text-slate-400">@{profileData.username}</p>
                  )}
                  <div className="flex items-start gap-2 mt-2">
                    <p className="text-slate-300 text-sm max-w-xl flex-1">
                      {profileData?.bio || (
                        <span className="text-slate-500 italic">Add a bio...</span>
                      )}
                    </p>
                    <button
                      onClick={() => setShowEditForm(true)}
                      className="p-1 rounded text-slate-500 hover:text-indigo-400 hover:bg-slate-700/50 transition-colors flex-shrink-0"
                      title="Edit bio"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setShowEditForm(!showEditForm)}
                  className="self-start sm:self-end px-4 py-2 rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors text-sm font-medium"
                >
                  {showEditForm ? 'Cancel' : 'Edit profile'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Classic header (NextAuth / non-Supabase) */}
        {!isSupabaseUser && (
          <div className="mb-8">
            <h1 className="text-2xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Profile
            </h1>
            <div className="text-slate-300 space-y-1">
              <div className="font-medium">
                Email: <span className="text-slate-200">{user.email}</span>
              </div>
              {user.name && (
                <div className="font-medium">
                  Name: <span className="text-slate-200">{user.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Profile edit form (Supabase) */}
        {isSupabaseUser && showEditForm && user && (
          <div className="mb-8 p-6 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <h2 className="text-lg font-semibold mb-4 text-slate-200">Edit profile</h2>
            <ProfileEditForm
              initialCoverUrl={profileData?.coverUrl}
              initialAvatarUrl={profileData?.avatarUrl}
              initialUsername={profileData?.username}
              initialBio={profileData?.bio}
              initialDisplayName={profileData?.displayName || user.name}
              onSaved={() => {
                setShowEditForm(false)
                if (supabaseUser) {
                  fetch(`/api/users/${supabaseUser.id}/profile`)
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
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Friends</h2>
            <ProfileFriendsSection
              userId={profileData.id}
              followersCount={profileData.followersCount}
              followingCount={profileData.followingCount}
              isOwnProfile
            />
          </div>
        )}

        {isGuest && !isSupabaseUser && (
          <div className="mb-6 p-4 bg-slate-800/60 border border-slate-700/50 rounded-xl">
            <p className="text-slate-300 text-sm">
              You're browsing as a guest. Sign in or create an account to save views, create personas, and follow venues or tags.
            </p>
            <Link
              href="/login"
              className="inline-block mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium hover:from-indigo-500 hover:to-purple-500 transition-all"
            >
              Sign in
            </Link>
          </div>
        )}

        {showImportPrompt && !isGuest && (
          <div className="mb-6 p-4 bg-indigo-900/30 border border-indigo-700/50 rounded-xl">
            <p className="mb-2 text-slate-200">You have saved views in local storage. Import them to your account?</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleImportLocalViews}
                className="min-h-[44px] px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
              >
                Import Views
              </button>
              <button onClick={() => setShowImportPrompt(false)} className="min-h-[44px] px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* My Saved Views (NextAuth only) */}
        {!isGuest && !isSupabaseUser && (
          <div className="mb-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">My Saved Views</h2>
            {savedViews.length === 0 ? (
              <p className="text-slate-500">No saved views yet. Save views from the calendar sidebar.</p>
            ) : (
              <div className="space-y-2">
                {savedViews.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition-colors"
                  >
                    <Link href={`/calendar?viewId=${v.id}`} className="font-medium text-indigo-400 hover:text-indigo-300">
                      {v.name}
                    </Link>
                    {v.is_public && v.share_slug && (
                      <Link href={`/v/${v.share_slug}`} className="text-xs text-slate-400 hover:text-indigo-400">
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
            onEventClick={setSelectedEvent}
          />
        )}

        {/* Follows Section (NextAuth) */}
        {!isSupabaseUser && (
        <div className="mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-slate-200">Follows</h2>
          {follows.length === 0 ? (
            <p className="text-slate-500">
              No follows yet. Follow venues from event cards or venue pages, and follow tags from event details.
            </p>
          ) : (
            <div className="space-y-2">
              {follows.map((follow) => (
                <div
                  key={follow.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50"
                >
                  <div>
                    <span className="text-xs text-slate-500 uppercase">{follow.type}</span>
                    <div className="font-medium text-slate-200">{follow.displayValue}</div>
                    <div className="text-sm text-slate-500">{follow.normalizedValue}</div>
                  </div>
                  {!isGuest && (
                    <button
                      onClick={() => handleDeleteFollow(follow.id)}
                      className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 text-sm text-red-400 hover:bg-red-900/30 rounded-lg transition-colors self-start sm:self-center"
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
            <h2 className="text-xl sm:text-2xl font-semibold mb-5 text-slate-200">Notification Settings</h2>
            {settings && (
              <div className="space-y-5 p-4 sm:p-6 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={(e) => handleUpdateSettings({ emailEnabled: e.target.checked })}
                    className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-5 h-5 cursor-pointer bg-slate-900"
                  />
                  <span className="text-slate-200 group-hover:text-white font-medium">Enable email notifications</span>
                </label>

                <div>
                  <label className="block mb-2 text-sm font-medium text-slate-300">Digest Frequency</label>
                  <select
                    value={settings.digestFrequency}
                    onChange={(e) => handleUpdateSettings({ digestFrequency: e.target.value as 'daily' | 'weekly' | 'never' })}
                    className="border border-slate-600/50 rounded-lg px-4 py-2.5 bg-slate-900/80 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="never">Never</option>
                  </select>
                </div>

                <label className="flex items-center gap-3 cursor-not-allowed p-3 rounded-lg opacity-60">
                  <input type="checkbox" checked={settings.instantEnabled} disabled className="rounded border-slate-600 w-5 h-5" />
                  <span className="text-slate-500">Instant notifications (coming soon)</span>
                </label>

                <div>
                  <label className="block mb-2 text-sm font-medium text-slate-300">Timezone</label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => handleUpdateSettings({ timezone: e.target.value })}
                    className="border border-slate-600/50 rounded-lg px-4 py-2.5 bg-slate-900/80 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full"
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
