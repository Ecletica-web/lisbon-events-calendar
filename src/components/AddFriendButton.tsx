'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { getFriendStatus } from '@/lib/friendRequests'

type FriendStatus = 'friends' | 'pending_sent' | 'pending_received' | null

interface AddFriendButtonProps {
  targetUserId: string
  size?: 'sm' | 'md'
  onStatusChange?: (status: FriendStatus) => void
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { supabase } = await import('@/lib/supabase/client')
  const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

export default function AddFriendButton({
  targetUserId,
  size = 'md',
  onStatusChange,
}: AddFriendButtonProps) {
  const supabaseAuth = useSupabaseAuth()
  const viewer = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const [status, setStatus] = useState<FriendStatus>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  const refresh = useCallback(async () => {
    setError(null)
    if (!supabaseConfigured || !viewer || viewer.id === targetUserId) {
      setChecked(true)
      return
    }
    try {
      const s = await getFriendStatus(viewer.id, targetUserId)
      setStatus(s)
      onStatusChangeRef.current?.(s)
    } catch (e) {
      console.error('AddFriendButton: getFriendStatus failed', e)
      setStatus(null)
    } finally {
      setChecked(true)
    }
  }, [supabaseConfigured, viewer?.id, targetUserId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSendRequest = async () => {
    if (!viewer || loading) return
    setError(null)
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      if (!headers.Authorization) {
        setError('Please sign in to add friends')
        return
      }
      const res = await fetch(`/api/users/${targetUserId}/friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus('pending_sent')
        onStatusChange?.('pending_sent')
      } else if (data.action === 'already_friends') {
        setStatus('friends')
      } else if (data.action === 'already_sent') {
        setStatus('pending_sent')
        onStatusChange?.('pending_sent')
      } else {
        setError(data.error || `Failed to send request (${res.status})`)
      }
    } catch (e) {
      console.error('Send friend request error:', e)
      setError('Failed to send friend request')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!viewer || loading) return
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/users/${targetUserId}/friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'accept' }),
      })
      if (res.ok) setStatus('friends')
    } catch (e) {
      console.error('Accept friend request error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRejectOrCancelOrUnfriend = async () => {
    if (!viewer || loading) return
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/users/${targetUserId}/friend-request`, {
        method: 'DELETE',
        headers,
      })
      if (res.ok) {
        setStatus(null)
        onStatusChange?.(null)
      }
    } catch (e) {
      console.error('Friend request action error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!supabaseConfigured || !viewer) return null
  if (viewer.id === targetUserId) return null

  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'
  const baseClass = `rounded-lg font-medium transition-colors ${sizeClass} min-h-[36px] inline-flex items-center justify-center gap-1`

  if (status === 'pending_received') {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleAccept}
          disabled={loading || !checked}
          className={`${baseClass} bg-indigo-600/80 text-white hover:bg-indigo-500`}
        >
          {loading ? '...' : 'Accept'}
        </button>
        <button
          onClick={handleRejectOrCancelOrUnfriend}
          disabled={loading || !checked}
          className={`${baseClass} border border-slate-600/50 text-slate-300 hover:bg-slate-700/80`}
        >
          Decline
        </button>
      </div>
    )
  }

  if (status === 'friends') {
    return (
      <button
        onClick={handleRejectOrCancelOrUnfriend}
        disabled={loading || !checked}
        className={`${baseClass} bg-slate-700/60 text-slate-300 border border-slate-600/50 hover:bg-slate-600/80`}
        title="Unfriend"
      >
        {loading ? '...' : 'Friends'}
      </button>
    )
  }

  if (status === 'pending_sent') {
    return (
      <button
        onClick={handleRejectOrCancelOrUnfriend}
        disabled={loading || !checked}
        className={`${baseClass} border border-slate-600/50 text-slate-400 hover:bg-slate-700/80`}
        title="Cancel request"
      >
        {loading ? '...' : 'Request sent'}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <button
        onClick={handleSendRequest}
        disabled={loading || !checked}
        className={`${baseClass} bg-indigo-600/80 text-white hover:bg-indigo-500`}
      >
        {loading ? '...' : 'Add friend'}
      </button>
    </div>
  )
}
