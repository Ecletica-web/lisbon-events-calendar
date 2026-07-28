'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [uploadSuccess, setUploadSuccess] = useState<'cover' | 'avatar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!uploadSuccess) return
    const t = setTimeout(() => setUploadSuccess(null), 3000)
    return () => clearTimeout(t)
  }, [uploadSuccess])

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
      setUploadSuccess(type)
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
        <label className="block mb-2 text-sm font-medium text-terminus-fg">Cover image</label>
        {coverUrl && (
          <div className="relative mb-2 rounded-none overflow-hidden bg-terminus-muted aspect-[3/1] max-h-32 border-2 border-terminus-strong">
            <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            <button
              type="button"
              onClick={() => setCoverUrl('')}
              className="absolute top-2 right-2 px-2 py-1 terminus-btn terminus-btn-ghost text-xs"
            >
              Remove
            </button>
          </div>
        )}
        {uploadSuccess === 'cover' && (
          <p className="mb-2 text-sm text-terminus-fg-muted">Cover image uploaded. Save profile to keep changes.</p>
        )}
        <div className="flex gap-2">
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
            className="terminus-btn text-xs uppercase tracking-wider px-3 py-2 disabled:opacity-50"
          >
            {uploading === 'cover' ? 'Uploading...' : 'Upload from device'}
          </button>
        </div>
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-terminus-fg">Profile picture</label>
        <div className="flex items-center gap-4 mb-2">
          {avatarUrl && (
            <div className="relative flex-shrink-0">
              <img src={avatarUrl} alt="Profile" className="w-16 h-16 rounded-none object-cover border-2 border-terminus-strong" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              <button
                type="button"
                onClick={() => setAvatarUrl('')}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-none bg-terminus-elevated border border-terminus-strong hover:bg-terminus-muted text-terminus-fg text-xs flex items-center justify-center"
                title="Remove"
              >
                ×
              </button>
            </div>
          )}
          {uploadSuccess === 'avatar' && (
            <p className="text-sm text-terminus-fg-muted">Profile picture uploaded. Save profile to keep changes.</p>
          )}
          <div>
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
              className="terminus-btn text-xs uppercase tracking-wider px-3 py-2 disabled:opacity-50"
            >
              {uploading === 'avatar' ? 'Uploading...' : 'Upload from device'}
            </button>
          </div>
        </div>
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-terminus-fg">Username <span className="text-terminus-fg-faint font-normal">(unique)</span></label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder="your_username"
          maxLength={30}
          className="terminus-input"
        />
        <p className="text-xs text-terminus-fg-faint mt-1">Unique across the app. 3–30 characters, letters, numbers, underscores only.</p>
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-terminus-fg">Display name <span className="text-terminus-fg-faint font-normal">(first and last name)</span></label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="First and last name"
          className="terminus-input"
        />
      </div>
      <div>
        <label className="block mb-2 text-sm font-medium text-terminus-fg">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          maxLength={200}
          rows={3}
          className="terminus-input resize-none"
        />
        <p className="text-xs text-terminus-fg-faint mt-1">{bio.length}/200</p>
      </div>
      {error && <div className="text-terminus-fg-muted text-sm">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="terminus-btn terminus-btn-primary px-4 py-2 text-xs uppercase tracking-wider disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save profile'}
      </button>
    </form>
  )
}
