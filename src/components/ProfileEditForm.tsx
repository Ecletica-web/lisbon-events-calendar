'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'

interface ProfileEditFormProps {
  initialCoverUrl?: string | null
  initialAvatarUrl?: string | null
  initialUsername?: string | null
  initialBio?: string | null
  initialDisplayName?: string | null
  onSaved?: (data?: { displayName?: string; avatarUrl?: string; coverUrl?: string; bio?: string; username?: string }) => void
}

export default function ProfileEditForm({
  initialCoverUrl,
  initialAvatarUrl,
  initialUsername,
  initialBio,
  initialDisplayName,
  onSaved,
}: ProfileEditFormProps) {
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '')
  const [username, setUsername] = useState(initialUsername ?? '')
  const [bio, setBio] = useState(initialBio ?? '')
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState<'cover' | 'avatar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (type: 'cover' | 'avatar', file: File) => {
    setError(null)
    setUploading(type)
    try {
      const { data: { user } } = await supabase?.auth.getUser() ?? { data: { user: null } }
      if (!user) {
        setError('Not signed in')
        return
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${user.id}/${type}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase!.storage
        .from('profile-images')
        .upload(path, file, { upsert: true })
      if (uploadError) throw new Error(uploadError.message)
      const { data: urlData } = supabase!.storage
        .from('profile-images')
        .getPublicUrl(path)
      if (type === 'cover') setCoverUrl(urlData.publicUrl)
      else setAvatarUrl(urlData.publicUrl)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data: { user: authUser } } = await supabase?.auth.getUser() ?? { data: { user: null } }
      if (!authUser || !supabase) {
        setError('Not signed in')
        return
      }
      const u = username.trim().toLowerCase()
      if (u && (u.length < 3 || u.length > 30)) {
        setError('Username must be 3–30 characters')
        return
      }
      if (u && !/^[a-z0-9_]+$/.test(u)) {
        setError('Username: letters, numbers, underscores only')
        return
      }
      const b = bio.trim()
      if (b.length > 200) {
        setError('Bio must be 200 characters or less')
        return
      }
      const { data, error: upsertError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            id: authUser.id,
            cover_url: coverUrl.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            username: u || null,
            bio: b || null,
            display_name: displayName.trim() || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single()
      if (upsertError) {
        if (upsertError.code === '23505') setError('Username already taken')
        else setError(upsertError.message || 'Failed to save')
        return
      }
      onSaved?.(data ? {
        displayName: data.display_name,
        avatarUrl: data.avatar_url,
        coverUrl: data.cover_url,
        bio: data.bio,
        username: data.username,
      } : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block mb-2 text-sm font-medium text-slate-200">Cover image</label>
        <div className="flex gap-2 mb-2">
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload('cover', f)
            }}
          />
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={!!uploading}
            className="px-3 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium disabled:opacity-50"
          >
            {uploading === 'cover' ? 'Uploading...' : 'Upload from device'}
          </button>
        </div>
        <input
          type="url"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="Or paste image URL"
          className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-slate-200">Profile picture</label>
        <div className="flex gap-2 mb-2">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload('avatar', f)
            }}
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={!!uploading}
            className="px-3 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm font-medium disabled:opacity-50"
          >
            {uploading === 'avatar' ? 'Uploading...' : 'Upload from device'}
          </button>
        </div>
        <input
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="Or paste image URL"
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
