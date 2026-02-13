'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import FollowUserButton from './FollowUserButton'
import AddFriendButton from './AddFriendButton'

interface Follower {
  id: string
  displayName?: string | null
  avatarUrl?: string | null
  username?: string | null
}

interface FriendRequestIncoming {
  id: string
  requesterId: string
  displayName?: string
  avatarUrl?: string | null
  username?: string | null
}

interface FriendRequestOutgoing {
  id: string
  addresseeId: string
  displayName?: string
  avatarUrl?: string | null
  username?: string | null
}

interface ProfileFriendsSectionProps {
  userId: string
  followersCount: number
  followingCount: number
  friendsCount?: number
  isOwnProfile?: boolean
}

type TabType = 'followers' | 'following' | 'friends' | 'requests' | 'add'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { supabase } = await import('@/lib/supabase/client')
  const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

export default function ProfileFriendsSection({
  userId,
  followersCount,
  followingCount,
  friendsCount = 0,
  isOwnProfile = false,
}: ProfileFriendsSectionProps) {
  const supabaseAuth = useSupabaseAuth()
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const [tab, setTab] = useState<TabType>('followers')
  const [list, setList] = useState<Follower[]>([])
  const [friendsList, setFriendsList] = useState<Follower[]>([])
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestIncoming[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestOutgoing[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Follower[]>([])
  const [searching, setSearching] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const refreshRequests = useCallback(async () => {
    if (!isOwnProfile || !supabaseConfigured) return
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return
    try {
      const res = await fetch(`/api/users/${userId}/friend-requests`, { headers })
      if (res.ok) {
        const { incoming, outgoing } = await res.json()
        setIncomingRequests(incoming ?? [])
        setOutgoingRequests(outgoing ?? [])
        setPendingCount((incoming?.length ?? 0) + (outgoing?.length ?? 0))
      }
    } catch {
      setIncomingRequests([])
      setOutgoingRequests([])
      setPendingCount(0)
    }
  }, [userId, isOwnProfile, supabaseConfigured])

  useEffect(() => {
    if (isOwnProfile && supabaseConfigured) refreshRequests()
  }, [isOwnProfile, supabaseConfigured, refreshRequests])

  useEffect(() => {
    if (tab === 'followers' || tab === 'following') {
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
    } else if (tab === 'friends') {
      setLoading(true)
      fetch(`/api/users/${userId}/friends`)
        .then((r) => r.json())
        .then((data) => setFriendsList(data.friends ?? []))
        .catch(() => setFriendsList([]))
        .finally(() => setLoading(false))
    } else if (tab === 'requests' && isOwnProfile) {
      setLoading(true)
      refreshRequests().finally(() => setLoading(false))
    }
  }, [userId, tab, isOwnProfile, refreshRequests])

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

  const displayName = (u: { displayName?: string | null; username?: string | null }) =>
    u.displayName || u.username || 'Unknown'

  const UserRow = ({
    user,
    idKey = 'id',
    action,
  }: {
    user: Follower | FriendRequestIncoming | FriendRequestOutgoing
    idKey?: 'id' | 'requesterId' | 'addresseeId'
    action?: React.ReactNode
  }) => {
    const id = (user as any)[idKey] as string
    const dn = displayName(user)
    return (
      <li className="flex items-center justify-between gap-3">
        <Link
          href={`/u/${id}`}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90"
        >
          <div className="relative w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-slate-600">
            <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm font-medium">
              {(dn[0] || '?').toUpperCase()}
            </div>
            {user.avatarUrl && (
              <img
                src={user.avatarUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-slate-200 truncate block">{dn}</span>
            {user.username && <span className="text-xs text-slate-500">@{user.username}</span>}
          </div>
        </Link>
        {action}
      </li>
    )
  }

  const tabs: { key: TabType; label: string; show: boolean }[] = [
    { key: 'followers', label: `${followersCount} Followers`, show: true },
    { key: 'following', label: `${followingCount} Following`, show: true },
    { key: 'friends', label: `${friendsCount} Friends`, show: true },
    {
      key: 'requests',
      label: pendingCount > 0 ? `Friend Requests (${pendingCount})` : 'Friend Requests',
      show: isOwnProfile,
    },
    { key: 'add', label: 'Add Friend', show: isOwnProfile },
  ]

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
      <div className="flex flex-wrap border-b border-slate-700/50 overflow-x-auto">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 min-w-[80px] px-3 py-3 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
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
                  <UserRow
                    key={u.id}
                    user={u}
                    action={
                      supabaseConfigured ? (
                        <AddFriendButton
                          targetUserId={u.id}
                          size="sm"
                          onStatusChange={() => {}}
                        />
                      ) : (
                        <FollowUserButton targetUserId={u.id} size="sm" />
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        ) : tab === 'requests' && isOwnProfile ? (
          loading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
            <p className="text-slate-500 text-sm">No friend requests.</p>
          ) : (
            <div className="space-y-4">
              {incomingRequests.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase mb-2">Incoming</p>
                  <ul className="space-y-2">
                    {incomingRequests.map((r) => (
                      <UserRow
                        key={r.id}
                        user={{ ...r, id: r.requesterId } as Follower}
                        idKey="requesterId"
                        action={
                          <AddFriendButton
                            targetUserId={r.requesterId}
                            size="sm"
                            onStatusChange={refreshRequests}
                          />
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}
              {outgoingRequests.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase mb-2">Outgoing</p>
                  <ul className="space-y-2">
                    {outgoingRequests.map((r) => (
                      <UserRow
                        key={r.id}
                        user={{ ...r, id: r.addresseeId } as Follower}
                        idKey="addresseeId"
                        action={
                          <AddFriendButton
                            targetUserId={r.addresseeId}
                            size="sm"
                            onStatusChange={refreshRequests}
                          />
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        ) : tab === 'friends' ? (
          loading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : friendsList.length === 0 ? (
            <p className="text-slate-500 text-sm">No friends yet.</p>
          ) : (
            <ul className="space-y-2">
              {friendsList.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  action={
                    !isOwnProfile && supabaseConfigured ? (
                      <AddFriendButton targetUserId={u.id} size="sm" />
                    ) : null
                  }
                />
              ))}
            </ul>
          )
        ) : loading ? (
          <p className="text-slate-500 text-sm">Loading...</p>
        ) : list.length === 0 ? (
          <p className="text-slate-500 text-sm">
            {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                action={
                  !isOwnProfile &&
                  (supabaseConfigured ? (
                    <AddFriendButton targetUserId={u.id} size="sm" />
                  ) : (
                    <FollowUserButton targetUserId={u.id} size="sm" />
                  ))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
