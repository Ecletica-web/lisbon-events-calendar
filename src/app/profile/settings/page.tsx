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
            })
          }
        })
        .catch(() => setSettings({ emailEnabled: false, digestFrequency: 'weekly', instantEnabled: false, timezone: 'Europe/Lisbon', notifyVenues: false, notifyPersonas: false, notifyPromoters: false }))
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
          })
        }
      } catch (e) {
        console.error(e)
      }
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
      <div className="max-w-2xl mx-auto p-4 sm:p-6 md:p-8 pt-20 md:pt-28 pb-8">
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/profile"
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="Back to profile"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
        </div>

        {/* Notifications */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">Notifications</h2>
          <div className="space-y-5 p-4 sm:p-6 rounded-xl bg-slate-800/60 border border-slate-700/50">
            {settings && (
              <>
                <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={(e) => handleUpdateSettings({ emailEnabled: e.target.checked })}
                    className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-5 h-5 cursor-pointer bg-slate-900"
                  />
                  <span className="text-slate-200 group-hover:text-white font-medium">Email notifications</span>
                </label>
                <div>
                  <label className="block mb-2 text-sm font-medium text-slate-300">Digest frequency</label>
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
                {isSupabaseUser && (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={settings.notifyVenues ?? false}
                        onChange={(e) => handleUpdateSettings({ notifyVenues: e.target.checked })}
                        className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-5 h-5 cursor-pointer bg-slate-900"
                      />
                      <span className="text-slate-200 group-hover:text-white font-medium">Events at venues I follow</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={settings.notifyPersonas ?? false}
                        onChange={(e) => handleUpdateSettings({ notifyPersonas: e.target.checked })}
                        className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-5 h-5 cursor-pointer bg-slate-900"
                      />
                      <span className="text-slate-200 group-hover:text-white font-medium">Events matching my personas</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={settings.notifyPromoters ?? false}
                        onChange={(e) => handleUpdateSettings({ notifyPromoters: e.target.checked })}
                        className="rounded border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 w-5 h-5 cursor-pointer bg-slate-900"
                      />
                      <span className="text-slate-200 group-hover:text-white font-medium">Events from promoters I follow</span>
                    </label>
                  </>
                )}
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
              </>
            )}
            {!settings && !isGuest && (
              <p className="text-slate-400">Loading notification settings...</p>
            )}
            {isGuest && (
              <p className="text-slate-500">Sign in to manage notifications.</p>
            )}
          </div>
        </section>

        {/* Connected accounts */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-slate-200">Connected accounts</h2>
          <div className="space-y-3 p-4 sm:p-6 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#1DB954]/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-slate-200">Spotify</div>
                  <div className="text-sm text-slate-500">Link your Spotify for music preferences</div>
                </div>
              </div>
              <button disabled className="px-4 py-2 rounded-lg bg-slate-700 text-slate-500 text-sm font-medium cursor-not-allowed">
                Coming soon
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-pink-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-slate-200">Instagram</div>
                  <div className="text-sm text-slate-500">Connect your Instagram account</div>
                </div>
              </div>
              <button disabled className="px-4 py-2 rounded-lg bg-slate-700 text-slate-500 text-sm font-medium cursor-not-allowed">
                Coming soon
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#4285F4]/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#4285F4]" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-slate-200">Google</div>
                  <div className="text-sm text-slate-500">Link Google Calendar & account</div>
                </div>
              </div>
              <button disabled className="px-4 py-2 rounded-lg bg-slate-700 text-slate-500 text-sm font-medium cursor-not-allowed">
                Coming soon
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
