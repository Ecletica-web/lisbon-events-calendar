'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'

interface NotificationSettings {
  emailEnabled: boolean
  digestFrequency: 'daily' | 'weekly' | 'never'
  instantEnabled: boolean
  timezone: string
  notifyVenues?: boolean
  notifyPersonas?: boolean
  notifyPromoters?: boolean
  eventVisibility?: 'public' | 'friends_only'
  privateProfile?: boolean
  friendsListPrivate?: boolean
}

export default function ProfileSettingsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const supabaseAuth = useSupabaseAuth()
  const supabaseUser = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const isSupabaseUser = supabaseConfigured && !!supabaseUser
  const isNextAuthUser = !supabaseConfigured && session?.user
  const isGuest = !supabaseConfigured && (session?.user as { id?: string })?.id === 'guest'
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

    if (isNextAuthUser && !isGuest) {
      fetch('/api/notification-settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.settings) {
            setSettings({
              emailEnabled: data.settings.email_enabled,
              digestFrequency: data.settings.digest_frequency || 'weekly',
              instantEnabled: data.settings.instant_enabled ?? false,
              timezone: data.settings.timezone || 'Europe/Lisbon',
            })
          } else {
            setSettings({
              emailEnabled: false,
              digestFrequency: 'weekly',
              instantEnabled: false,
              timezone: 'Europe/Lisbon',
            })
          }
        })
        .finally(() => setLoading(false))
    } else if (isSupabaseUser) {
      fetch('/api/profile/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.settings) {
            setSettings({
              emailEnabled: data.settings.email_enabled ?? false,
              digestFrequency: data.settings.digest_frequency || 'weekly',
              instantEnabled: data.settings.instant_enabled ?? false,
              timezone: data.settings.timezone || 'Europe/Lisbon',
              notifyVenues: data.settings.notify_venues ?? false,
              notifyPersonas: data.settings.notify_personas ?? false,
              notifyPromoters: data.settings.notify_promoters ?? false,
              eventVisibility: (data.settings.event_visibility as 'public' | 'friends_only') ?? 'public',
              privateProfile: data.settings.private_profile ?? false,
              friendsListPrivate: data.settings.friends_list_private ?? false,
            })
          } else {
            setSettings({
              emailEnabled: false,
              digestFrequency: 'weekly',
              instantEnabled: false,
              timezone: 'Europe/Lisbon',
              notifyVenues: false,
              notifyPersonas: false,
              notifyPromoters: false,
              eventVisibility: 'public',
              privateProfile: false,
              friendsListPrivate: false,
            })
          }
        })
        .catch(() => setSettings({ emailEnabled: false, digestFrequency: 'weekly', instantEnabled: false, timezone: 'Europe/Lisbon', notifyVenues: false, notifyPersonas: false, notifyPromoters: false, privateProfile: false, friendsListPrivate: false }))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [session, status, router, isGuest, supabaseConfigured, supabaseUser, user, isSupabaseUser, isNextAuthUser])

  const handleUpdateSettings = async (updates: Partial<NotificationSettings>) => {
    if (!user || isGuest) return
    if (isNextAuthUser) {
      try {
        const response = await fetch('/api/notification-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email_enabled: updates.emailEnabled,
            digest_frequency: updates.digestFrequency,
            instant_enabled: updates.instantEnabled,
            timezone: updates.timezone,
          }),
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
      } catch (e) {
        console.error(e)
      }
    } else if (isSupabaseUser) {
      try {
        const { supabase } = await import('@/lib/supabase/client')
        const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
        if (!session?.access_token) return
        const response = await fetch('/api/profile/settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email_enabled: updates.emailEnabled,
            digest_frequency: updates.digestFrequency,
            instant_enabled: updates.instantEnabled,
            timezone: updates.timezone,
            notify_venues: updates.notifyVenues,
            notify_personas: updates.notifyPersonas,
            notify_promoters: updates.notifyPromoters,
            event_visibility: updates.eventVisibility,
            private_profile: updates.privateProfile,
            friends_list_private: updates.friendsListPrivate,
          }),
        })
        if (response.ok) {
          const { settings: newSettings } = await response.json()
          setSettings({
            emailEnabled: newSettings.email_enabled ?? false,
            digestFrequency: newSettings.digest_frequency || 'weekly',
            instantEnabled: newSettings.instant_enabled ?? false,
            timezone: newSettings.timezone || 'Europe/Lisbon',
            notifyVenues: newSettings.notify_venues ?? false,
            notifyPersonas: newSettings.notify_personas ?? false,
            notifyPromoters: newSettings.notify_promoters ?? false,
            eventVisibility: (newSettings.event_visibility as 'public' | 'friends_only') ?? 'public',
            privateProfile: newSettings.private_profile ?? false,
            friendsListPrivate: newSettings.friends_list_private ?? false,
          })
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  if ((!supabaseConfigured && status === 'loading') || loading) {
    return (
      <div className="min-h-screen bg-terminus-bg flex items-center justify-center pt-24">
        <div className="text-terminus-fg-muted">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  const checkClass =
    'rounded-none border-2 border-terminus-strong text-terminus-accent focus:ring-2 focus:ring-terminus-accent w-5 h-5 cursor-pointer bg-terminus-bg'

  return (
    <div className="min-h-screen min-h-[100dvh] bg-terminus-bg text-terminus-fg">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 md:p-8 pt-20 md:pt-28 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/profile"
            className="p-2 rounded-none text-terminus-fg-muted hover:bg-terminus-muted hover:text-terminus-fg transition-colors"
            aria-label="Back to profile"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-pixel text-[10px] sm:text-xs text-terminus-fg terminus-cursor">{'> SETTINGS'}</h1>
        </div>

        {/* Privacy (Supabase only) */}
        {isSupabaseUser && settings && (
          <section className="mb-10">
            <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> PRIVACY'}</h2>
            <div className="p-4 sm:p-6 terminus-panel mb-6 space-y-1">
              <label className="flex items-center justify-between gap-4 cursor-pointer p-3 rounded-none hover:bg-terminus-muted transition-colors">
                <span className="text-terminus-fg">Private profile</span>
                <input
                  type="checkbox"
                  checked={settings.privateProfile === true}
                  onChange={(e) => handleUpdateSettings({ privateProfile: e.target.checked })}
                  className={checkClass}
                />
              </label>
              <p className="text-terminus-fg-faint text-sm px-3 pb-2">When on, only you can see your profile info (name, bio, photo). Others will see &quot;This profile is private&quot;.</p>
              <label className="flex items-center justify-between gap-4 cursor-pointer p-3 rounded-none hover:bg-terminus-muted transition-colors">
                <span className="text-terminus-fg">Private friends list</span>
                <input
                  type="checkbox"
                  checked={settings.friendsListPrivate === true}
                  onChange={(e) => handleUpdateSettings({ friendsListPrivate: e.target.checked })}
                  className={checkClass}
                />
              </label>
              <p className="text-terminus-fg-faint text-sm px-3">When on, only you can see your friends list on your profile.</p>
            </div>
            <h3 className="font-pixel text-[10px] text-terminus-fg-muted mb-3">{'> EVENT VISIBILITY'}</h3>
            <div className="p-4 sm:p-6 terminus-panel">
              <p className="text-terminus-fg-muted mb-4 text-sm">Who can see your Going, Saved, and Liked events on your profile?</p>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-none hover:bg-terminus-muted transition-colors">
                  <input
                    type="radio"
                    name="eventVisibility"
                    checked={settings.eventVisibility === 'public'}
                    onChange={() => handleUpdateSettings({ eventVisibility: 'public' })}
                    className="border-terminus-strong text-terminus-accent focus:ring-2 focus:ring-terminus-accent"
                  />
                  <span className="text-terminus-fg">Public — anyone can see</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-none hover:bg-terminus-muted transition-colors">
                  <input
                    type="radio"
                    name="eventVisibility"
                    checked={settings.eventVisibility === 'friends_only'}
                    onChange={() => handleUpdateSettings({ eventVisibility: 'friends_only' })}
                    className="border-terminus-strong text-terminus-accent focus:ring-2 focus:ring-terminus-accent"
                  />
                  <span className="text-terminus-fg">Friends only — only accepted friends can see</span>
                </label>
              </div>
            </div>
          </section>
        )}

        {/* Preferences */}
        <section className="mb-10">
          <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> PREFERENCES'}</h2>
          <div className="p-4 sm:p-6 terminus-panel">
            <p className="text-terminus-fg-muted mb-4 text-sm">
              Customize what events you see — tags, vibe, free-only, and more.
            </p>
            <Link
              href="/onboarding?edit=1"
              className="inline-flex items-center gap-2 terminus-btn terminus-btn-primary px-4 py-2 text-xs uppercase tracking-wider"
            >
              Edit preferences
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>

        {/* Notifications */}
        <section className="mb-10">
          <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> NOTIFICATIONS'}</h2>
          <div className="space-y-5 p-4 sm:p-6 terminus-panel">
            {settings && (
              <>
                <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-none hover:bg-terminus-muted transition-colors">
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={(e) => handleUpdateSettings({ emailEnabled: e.target.checked })}
                    className={checkClass}
                  />
                  <span className="text-terminus-fg font-medium">Email notifications</span>
                </label>
                <div>
                  <label className="block mb-2 text-sm font-medium text-terminus-fg-muted">Digest frequency</label>
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
                {isSupabaseUser && (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-none hover:bg-terminus-muted transition-colors">
                      <input
                        type="checkbox"
                        checked={settings.notifyVenues ?? false}
                        onChange={(e) => handleUpdateSettings({ notifyVenues: e.target.checked })}
                        className={checkClass}
                      />
                      <span className="text-terminus-fg font-medium">Events at venues I follow</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-none hover:bg-terminus-muted transition-colors">
                      <input
                        type="checkbox"
                        checked={settings.notifyPersonas ?? false}
                        onChange={(e) => handleUpdateSettings({ notifyPersonas: e.target.checked })}
                        className={checkClass}
                      />
                      <span className="text-terminus-fg font-medium">Events matching my personas</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-none hover:bg-terminus-muted transition-colors">
                      <input
                        type="checkbox"
                        checked={settings.notifyPromoters ?? false}
                        onChange={(e) => handleUpdateSettings({ notifyPromoters: e.target.checked })}
                        className={checkClass}
                      />
                      <span className="text-terminus-fg font-medium">Events from promoters I follow</span>
                    </label>
                  </>
                )}
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
              </>
            )}
            {!settings && !isGuest && (
              <p className="text-terminus-fg-muted">Loading notification settings...</p>
            )}
            {isGuest && (
              <p className="text-terminus-fg-faint">Sign in to manage notifications.</p>
            )}
          </div>
        </section>

        {/* Connected accounts */}
        <section>
          <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg mb-4">{'> CONNECTED'}</h2>
          <div className="space-y-3 p-4 sm:p-6 terminus-panel">
            <div className="flex items-center justify-between p-3 rounded-none bg-terminus-bg border-2 border-terminus-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none border-2 border-terminus-strong bg-terminus-muted flex items-center justify-center text-terminus-fg text-xs font-pixel">
                  SP
                </div>
                <div>
                  <div className="font-medium text-terminus-fg">Spotify</div>
                  <div className="text-sm text-terminus-fg-faint">Link your Spotify for music preferences</div>
                </div>
              </div>
              <button disabled className="px-4 py-2 rounded-none bg-terminus-muted text-terminus-fg-faint text-xs uppercase tracking-wider cursor-not-allowed">
                Coming soon
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-none bg-terminus-bg border-2 border-terminus-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none border-2 border-terminus-strong bg-terminus-muted flex items-center justify-center text-terminus-fg text-xs font-pixel">
                  IG
                </div>
                <div>
                  <div className="font-medium text-terminus-fg">Instagram</div>
                  <div className="text-sm text-terminus-fg-faint">Connect your Instagram account</div>
                </div>
              </div>
              <button disabled className="px-4 py-2 rounded-none bg-terminus-muted text-terminus-fg-faint text-xs uppercase tracking-wider cursor-not-allowed">
                Coming soon
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-none bg-terminus-bg border-2 border-terminus-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none border-2 border-terminus-strong bg-terminus-muted flex items-center justify-center text-terminus-fg text-xs font-pixel">
                  G
                </div>
                <div>
                  <div className="font-medium text-terminus-fg">Google</div>
                  <div className="text-sm text-terminus-fg-faint">Link Google Calendar & account</div>
                </div>
              </div>
              <button disabled className="px-4 py-2 rounded-none bg-terminus-muted text-terminus-fg-faint text-xs uppercase tracking-wider cursor-not-allowed">
                Coming soon
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
