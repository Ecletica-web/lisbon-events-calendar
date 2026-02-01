'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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

export default function ProfilePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [follows, setFollows] = useState<Follow[]>([])
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [showImportPrompt, setShowImportPrompt] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    
    if (status === 'unauthenticated' || !session?.user) {
      router.push('/login')
      return
    }

    loadFollows()
    loadSettings()
    checkForLocalViews()
  }, [session, status, router])

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

  const checkForLocalViews = () => {
    const { getSavedViews } = require('@/lib/savedViews')
    const localViews = getSavedViews()
    if (localViews.length > 0) {
      setShowImportPrompt(true)
    }
  }

  const handleImportLocalViews = async () => {
    const { importLocalViewsToDB } = require('@/lib/savedViewsSync')
    try {
      const imported = await importLocalViewsToDB()
      alert(`Imported ${imported} view(s) from local storage`)
      setShowImportPrompt(false)
    } catch (error) {
      console.error('Error importing views:', error)
      alert('Failed to import views')
    }
  }

  const handleDeleteFollow = async (id: string) => {
    if (!session?.user) return

    if (!confirm('Unfollow this item?')) return

    try {
      const response = await fetch(`/api/follows?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setFollows((prev) => prev.filter((f) => f.id !== id))
      }
    } catch (error) {
      console.error('Error deleting follow:', error)
    }
  }

  const handleUpdateSettings = async (updates: Partial<NotificationSettings>) => {
    if (!session?.user) return

    try {
      const response = await fetch('/api/notification-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
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

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  const user = session.user

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-4xl mx-auto p-4 md:p-8 pt-20 md:pt-28">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">Profile</h1>
          <div className="text-gray-600 space-y-1">
            <div className="font-medium">Email: <span className="text-gray-800">{user.email}</span></div>
            {user.name && <div className="font-medium">Name: <span className="text-gray-800">{user.name}</span></div>}
          </div>
        </div>

        {showImportPrompt && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="mb-2">You have saved views in local storage. Import them to your account?</p>
            <div className="flex gap-2">
              <button
                onClick={handleImportLocalViews}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Import Views
              </button>
              <button
                onClick={() => setShowImportPrompt(false)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Follows Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Follows</h2>
          {follows.length === 0 ? (
            <p className="text-gray-500">No follows yet. Follow tags, venues, sources, or artists from event details.</p>
          ) : (
            <div className="space-y-2">
              {follows.map((follow) => (
                <div
                  key={follow.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded"
                >
                  <div>
                    <span className="text-xs text-gray-500 uppercase">{follow.type}</span>
                    <div className="font-medium">{follow.displayValue}</div>
                    <div className="text-sm text-gray-500">{follow.normalizedValue}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteFollow(follow.id)}
                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                  >
                    Unfollow
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notification Settings Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-5 text-gray-800">Notification Settings</h2>
          {settings && (
            <div className="space-y-5 bg-white/80 backdrop-blur-sm p-6 rounded-xl border-2 border-gray-200/50 shadow-sm">
              <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-gray-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={settings.emailEnabled}
                  onChange={(e) =>
                    handleUpdateSettings({ emailEnabled: e.target.checked })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/50 w-5 h-5 cursor-pointer"
                />
                <span className="text-gray-700 group-hover:text-gray-900 font-medium">Enable email notifications</span>
              </label>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Digest Frequency</label>
                <select
                  value={settings.digestFrequency}
                  onChange={(e) =>
                    handleUpdateSettings({
                      digestFrequency: e.target.value as 'daily' | 'weekly' | 'never',
                    })
                  }
                  className="border border-gray-300/50 rounded-lg px-4 py-2.5 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-sm w-full"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="never">Never</option>
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-not-allowed p-3 rounded-lg opacity-60">
                <input
                  type="checkbox"
                  checked={settings.instantEnabled}
                  onChange={(e) =>
                    handleUpdateSettings({ instantEnabled: e.target.checked })
                  }
                  className="rounded border-gray-300 w-5 h-5"
                  disabled
                />
                <span className="text-gray-500">Instant notifications (coming soon)</span>
              </label>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Timezone</label>
                <select
                  value={settings.timezone}
                  onChange={(e) => handleUpdateSettings({ timezone: e.target.value })}
                  className="border border-gray-300/50 rounded-lg px-4 py-2.5 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-sm w-full"
                >
                  <option value="Europe/Lisbon">Europe/Lisbon</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
