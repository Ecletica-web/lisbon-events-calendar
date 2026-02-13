'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface ProfileEditFormProps {
  initialCoverUrl?: string | null
  initialUsername?: string | null
  initialBio?: string | null
  initialDisplayName?: string | null
  onSaved?: () => void
}

export default function ProfileEditForm({
  initialCoverUrl,
  initialUsername,
  initialBio,
  initialDisplayName,
  onSaved,
}: ProfileEditFormProps) {
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl ?? '')
  const [username, setUsername] = useState(initialUsername ?? '')
  const [bio, setBio] = useState(initialBio ?? '')
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } }
      if (!session?.access_token) {
        setError('Not signed in')
        return
      }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          cover_url: coverUrl.trim() || null,
          username: username.trim() ? username.trim().toLowerCase() : null,
          bio: bio.trim() || null,
          display_name: displayName.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save')
        return
      }
      onSaved?.()
    } catch (err) {
      setError('Failed to save profile')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block mb-2 text-sm font-medium text-slate-200">Cover image URL</label>
        <input
          type="url"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="https://..."
          className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-slate-200">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder="your_username"
          maxLength={30}
          className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <p className="text-xs text-slate-500 mt-1">3–30 characters, letters, numbers, underscores only</p>
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-slate-200">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-slate-200">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          maxLength={200}
          rows={3}
          className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
        />
        <p className="text-xs text-slate-500 mt-1">{bio.length}/200</p>
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
      >
        {loading ? 'Saving...' : 'Save profile'}
      </button>
    </form>
  )
}
