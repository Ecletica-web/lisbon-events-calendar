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
  const [tab, setTab] = useState<'followers' | 'following' | 'add'>('followers')
  const [list, setList] = useState<Follower[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Follower[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (tab !== 'add') {
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
    }
  }, [userId, tab])

  const handleSearch = async () => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSearchResults(data.users ?? [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const displayName = (u: Follower) => u.displayName || u.username || 'Unknown'

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
      <div className="flex flex-wrap border-b border-slate-700/50">
        <button
          onClick={() => setTab('followers')}
          className={`flex-1 min-w-[100px] px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'followers'
              ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {followersCount} Followers
        </button>
        <button
          onClick={() => setTab('following')}
          className={`flex-1 min-w-[100px] px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'following'
              ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {followingCount} Following
        </button>
        {isOwnProfile && (
          <button
            onClick={() => setTab('add')}
            className={`flex-1 min-w-[100px] px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'add'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Add Friend
          </button>
        )}
      </div>
      <div className="p-4 max-h-64 overflow-y-auto">
        {tab === 'add' && isOwnProfile ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by username or display name..."
                className="flex-1 border border-slate-600/50 rounded-lg px-4 py-2 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
              <button
                onClick={handleSearch}
                disabled={searching || searchQuery.trim().length < 2}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            {searchResults.length === 0 && searchQuery.trim().length >= 2 && !searching && (
              <p className="text-slate-500 text-sm">No users found. Try a different search.</p>
            )}
            {searchResults.length > 0 && (
              <ul className="space-y-2">
                {searchResults.map((u) => (
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
                        {u.username && <span className="text-xs text-slate-500">@{u.username}</span>}
                      </div>
                    </Link>
                    <FollowUserButton targetUserId={u.id} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : loading ? (
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
