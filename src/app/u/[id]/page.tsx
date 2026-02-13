'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import FollowUserButton from '@/components/FollowUserButton'
import ProfileFriendsSection from '@/components/ProfileFriendsSection'

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

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('Invalid profile')
      return
    }

    async function load() {
      try {
        const profileRes = await fetch(`/api/users/${id}/profile`)
        if (profileRes.ok) {
          const json = await profileRes.json()
          setProfileData(json)
          setMode('profile')
          setLoading(false)
          return
        }
        if (FEATURE_FLAGS.SHARED_VIEWS) {
          const publicRes = await fetch(`/api/users/${id}/public`)
          if (publicRes.ok) {
            const json = await publicRes.json()
            setPublicData(json)
            setMode('public')
          } else {
            setError('Profile not found')
          }
        } else {
          setError('Profile not found')
        }
      } catch {
        setError('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

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
        <Link href="/calendar" className="text-indigo-400 hover:underline">Go home</Link>
      </div>
    )
  }

  if (mode === 'profile' && profileData) {
    const isOwnProfile = currentUser?.id === profileData.id
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <div className="max-w-2xl mx-auto">
          <div className="-mx-4 sm:-mx-6 md:0 -mt-0">
            <div className="relative h-40 sm:h-48 bg-slate-800">
              {profileData.coverUrl ? (
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
            <div className="relative px-4 sm:px-6 md:px-8 -mt-20">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                {profileData.avatarUrl ? (
                  <img
                    src={profileData.avatarUrl}
                    alt=""
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-900 object-cover bg-slate-700"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-900 bg-slate-700 flex items-center justify-center text-3xl sm:text-4xl font-bold text-slate-400">
                    {(profileData.displayName || '?')[0].toUpperCase()}
                  </div>
                )}
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
                {!isOwnProfile && <FollowUserButton targetUserId={profileData.id} />}
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6 md:p-8 pt-4">
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-slate-200">Friends</h2>
              <ProfileFriendsSection
                userId={profileData.id}
                followersCount={profileData.followersCount}
                followingCount={profileData.followingCount}
                isOwnProfile={false}
              />
            </div>
            <Link href="/calendar" className="text-indigo-400 hover:underline">← Back to Calendar</Link>
          </div>
        </div>
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
