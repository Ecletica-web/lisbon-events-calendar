'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import AddFriendButton from './AddFriendButton'

interface FriendUser {
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
  friendsCount?: number
  isOwnProfile?: boolean
  onFriendsCountChange?: (count: number) => void
}

type TabType = 'friends' | 'requests' | 'add'

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
  friendsCount = 0,
  isOwnProfile = false,
  onFriendsCountChange,
}: ProfileFriendsSectionProps) {
  const supabaseAuth = useSupabaseAuth()
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const [tab, setTab] = useState<TabType>('friends')
  const [friendsList, setFriendsList] = useState<FriendUser[]>([])
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestIncoming[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestOutgoing[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FriendUser[]>([])
  const [browseList, setBrowseList] = useState<FriendUser[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  type FriendStatus = 'friends' | 'pending_sent' | 'pending_received' | null
  const [addTabStatusMap, setAddTabStatusMap] = useState<Record<string, FriendStatus>>({})
  const [addTabStatusIdsKey, setAddTabStatusIdsKey] = useState('')
  const onFriendsCountChangeRef = useRef(onFriendsCountChange)
  onFriendsCountChangeRef.current = onFriendsCountChange

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

  const refreshFriends = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true)
      try {
        const res = await fetch(`/api/users/${userId}/friends`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const list = res.ok && Array.isArray(data.friends) ? data.friends : []
        setFriendsList(list)
        onFriendsCountChangeRef.current?.(list.length)
      } catch {
        setFriendsList([])
        onFriendsCountChangeRef.current?.(0)
      } finally {
        setLoading(false)
      }
    },
    [userId]
  )

  const prevTabRef = useRef<TabType | null>(null)
  const lastFriendsFetchRef = useRef(0)
  const hasLoadedFriendsOnceRef = useRef(false)
  const FRIENDS_FETCH_THROTTLE_MS = 2000

  useEffect(() => {
    if (isOwnProfile && supabaseConfigured) refreshRequests()
  }, [isOwnProfile, supabaseConfigured, refreshRequests])

  // Load friends list when section mounts with Friends tab (ensures list shows even if tab effect runs late)
  useEffect(() => {
    if (!userId || tab !== 'friends') return
    if (!hasLoadedFriendsOnceRef.current) {
      hasLoadedFriendsOnceRef.current = true
      refreshFriends(false)
    }
  }, [userId, tab, refreshFriends])

  useEffect(() => {
    const prevTab = prevTabRef.current
    prevTabRef.current = tab
    if (tab === 'friends') {
      if (prevTab !== 'friends') {
        const hasCachedData = friendsList.length > 0
        const throttle = hasCachedData && Date.now() - lastFriendsFetchRef.current < FRIENDS_FETCH_THROTTLE_MS
        if (throttle) return
        lastFriendsFetchRef.current = Date.now()
        refreshFriends(!hasCachedData)
      }
    } else if (tab === 'requests' && isOwnProfile && prevTab !== 'requests') {
      setLoading(true)
      refreshRequests().finally(() => setLoading(false))
    }
  }, [userId, tab, isOwnProfile, refreshRequests, refreshFriends])

  const handleSearch = useCallback(async () => {
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
  }, [searchQuery])

  const fetchBrowse = useCallback(async () => {
    setBrowseLoading(true)
    try {
      const res = await fetch('/api/users/search?browse=1&limit=20')
      const data = await res.json()
      setBrowseList(data.users ?? [])
    } catch {
      setBrowseList([])
    } finally {
      setBrowseLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'add' && isOwnProfile && browseList.length === 0 && !browseLoading) {
      fetchBrowse()
    }
  }, [tab, isOwnProfile, browseList.length, browseLoading, fetchBrowse])

  const currentUserId = supabaseAuth?.user?.id
  const addTabUserIds = tab === 'add'
    ? (searchQuery.trim().length >= 2 ? searchResults : browseList)
        .filter((u) => u.id !== currentUserId)
        .map((u) => u.id)
    : []
  const addTabIdsKeySorted = addTabUserIds.length > 0 ? [...addTabUserIds].sort().join(',') : ''
  const batchFetchInFlightRef = useRef(false)

  useEffect(() => {
    if (tab !== 'add' || addTabUserIds.length === 0 || !isOwnProfile) {
      setAddTabStatusIdsKey('')
      batchFetchInFlightRef.current = false
      return
    }
    if (batchFetchInFlightRef.current) return
    const idsKey = [...addTabUserIds].sort().join(',')
    batchFetchInFlightRef.current = true
    const clearInFlight = () => { batchFetchInFlightRef.current = false }
    getAuthHeaders()
      .then((headers) => {
        if (!headers.Authorization) {
          setAddTabStatusMap({})
          setAddTabStatusIdsKey('')
          clearInFlight()
          return
        }
        fetch(`/api/users/friend-status?ids=${idsKey}`, { headers })
          .then((res) => res.json().catch(() => ({ statuses: {} })))
          .then((data) => {
            setAddTabStatusMap(data.statuses ?? {})
            setAddTabStatusIdsKey(idsKey)
          })
          .catch(() => {
            setAddTabStatusMap({})
            setAddTabStatusIdsKey(idsKey)
          })
          .finally(clearInFlight)
      })
      .catch(clearInFlight)
  }, [tab, isOwnProfile, addTabIdsKeySorted])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    const t = setTimeout(() => handleSearch(), 300)
    return () => clearTimeout(t)
  }, [searchQuery, handleSearch])

  const displayName = (u: { displayName?: string | null; username?: string | null }) =>
    u.displayName || u.username || 'Unknown'

  const UserRow = ({
    user,
    idKey = 'id',
    action,
  }: {
    user: FriendUser | FriendRequestIncoming | FriendRequestOutgoing
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
            {searchQuery.trim().length >= 2 ? (
              <>
                {searching && <p className="text-slate-500 text-sm">Searching...</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="text-slate-500 text-sm">No users found. Try a different search.</p>
                )}
                {!searching && searchResults.length > 0 && (
                  <ul className="space-y-2">
                    {searchResults.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        action={
                          supabaseConfigured ? (
                            addTabStatusIdsKey !== addTabIdsKeySorted ? (
                              <span className="text-slate-500 text-sm">...</span>
                            ) : (
                              <AddFriendButton
                                targetUserId={u.id}
                                size="sm"
                                status={addTabStatusMap[u.id]}
                                onStatusChange={(s) => {
                                  setAddTabStatusMap((prev) => ({ ...prev, [u.id]: s ?? null }))
                                  if (s === 'friends') refreshFriends(false)
                                }}
                              />
                            )
                          ) : null
                        }
                      />
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="text-slate-500 text-sm">Type 2+ characters to search, or browse existing users below.</p>
                {browseLoading ? (
                  <p className="text-slate-500 text-sm">Loading users...</p>
                ) : browseList.length > 0 ? (
                  <ul className="space-y-2">
                    {browseList
                      .filter((u) => u.id !== supabaseAuth?.user?.id)
                      .map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        action={
                          supabaseConfigured ? (
                            addTabStatusIdsKey !== addTabIdsKeySorted ? (
                              <span className="text-slate-500 text-sm">...</span>
                            ) : (
                              <AddFriendButton
                                targetUserId={u.id}
                                size="sm"
                                status={addTabStatusMap[u.id]}
                                onStatusChange={(s) => {
                                  setAddTabStatusMap((prev) => ({ ...prev, [u.id]: s ?? null }))
                                  if (s === 'friends') refreshFriends(false)
                                }}
                              />
                            )
                          ) : null
                        }
                      />
                    ))}
                  </ul>
                ) : !browseLoading ? (
                  <p className="text-slate-500 text-sm">No users to show yet.</p>
                ) : null}
              </>
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
                        user={{ ...r, id: r.requesterId } as FriendUser}
                        idKey="requesterId"
                        action={
                          <AddFriendButton
                            targetUserId={r.requesterId}
                            size="sm"
                            status="pending_received"
                            onStatusChange={(s) => {
                              refreshRequests()
                              if (s === 'friends') {
                                const newFriend: FriendUser = {
                                  id: r.requesterId,
                                  displayName: r.displayName ?? null,
                                  avatarUrl: r.avatarUrl ?? null,
                                  username: r.username ?? null,
                                }
                                setFriendsList((prev) => {
                                  if (prev.some((f) => f.id === newFriend.id)) return prev
                                  const next = [...prev, newFriend]
                                  onFriendsCountChangeRef.current?.(next.length)
                                  return next
                                })
                                refreshFriends(false)
                              }
                            }}
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
                        user={{ ...r, id: r.addresseeId } as FriendUser}
                        idKey="addresseeId"
                        action={
                          <AddFriendButton
                            targetUserId={r.addresseeId}
                            size="sm"
                            status="pending_sent"
                            onStatusChange={(s) => {
                              refreshRequests()
                              if (s === 'friends') refreshFriends(false)
                            }}
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
        ) : null}
      </div>
    </div>
  )
}
