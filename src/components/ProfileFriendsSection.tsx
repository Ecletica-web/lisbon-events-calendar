'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import FollowUserButton from './FollowUserButton'

interface Follower {
  id: string
  displayName?: string | null
  avatarUrl?: string | null
  username?: string | null
}

interface ProfileFriendsSectionProps {
  userId: string
  followersCount: number
  followingCount: number
  isOwnProfile?: boolean
}

export default function ProfileFriendsSection({
  userId,
  followersCount,
  followingCount,
  isOwnProfile = false,
}: ProfileFriendsSectionProps) {
  const [tab, setTab] = useState<'followers' | 'following'>('followers')
  const [list, setList] = useState<Follower[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const endpoint = tab === 'followers' ? `/api/users/${userId}/followers` : `/api/users/${userId}/following`
    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => {
        const items = tab === 'followers' ? data.followers ?? [] : data.following ?? []
        setList(items)
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [userId, tab])

  const displayName = (u: Follower) => u.displayName || u.username || 'Unknown'

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
      <div className="flex border-b border-slate-700/50">
        <button
          onClick={() => setTab('followers')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'followers'
              ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {followersCount} Followers
        </button>
        <button
          onClick={() => setTab('following')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'following'
              ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {followingCount} Following
        </button>
      </div>
      <div className="p-4 max-h-64 overflow-y-auto">
        {loading ? (
          <p className="text-slate-500 text-sm">Loading...</p>
        ) : list.length === 0 ? (
          <p className="text-slate-500 text-sm">
            {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3">
                <Link
                  href={`/u/${u.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90"
                >
                  {u.avatarUrl ? (
                    <img
                      src={u.avatarUrl}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-600 flex-shrink-0 flex items-center justify-center text-slate-300 text-sm font-medium">
                      {(displayName(u)[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="font-medium text-slate-200 truncate block">{displayName(u)}</span>
                    {u.username && (
                      <span className="text-xs text-slate-500">@{u.username}</span>
                    )}
                  </div>
                </Link>
                {!isOwnProfile && <FollowUserButton targetUserId={u.id} size="sm" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
