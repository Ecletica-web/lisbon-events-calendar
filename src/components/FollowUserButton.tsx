'use client'

import { useState, useEffect } from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { followUser, unfollowUser, isFollowing } from '@/lib/follows'

interface FollowUserButtonProps {
  targetUserId: string
  size?: 'sm' | 'md'
  variant?: 'default' | 'outline'
}

export default function FollowUserButton({
  targetUserId,
  size = 'md',
  variant = 'default',
}: FollowUserButtonProps) {
  const supabaseAuth = useSupabaseAuth()
  const viewer = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured || !viewer || viewer.id === targetUserId) {
      setChecked(true)
      return
    }
    isFollowing(viewer.id, targetUserId).then((val) => {
      setFollowing(val)
      setChecked(true)
    })
  }, [supabaseConfigured, viewer, targetUserId])

  const handleClick = async () => {
    if (!viewer || viewer.id === targetUserId || loading) return
    setLoading(true)
    try {
      if (following) {
        const { error } = await unfollowUser(viewer.id, targetUserId)
        if (!error) setFollowing(false)
      } else {
        const { error } = await followUser(viewer.id, targetUserId)
        if (!error) setFollowing(true)
      }
    } catch (e) {
      console.error('Follow user error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!supabaseConfigured || !viewer) return null
  if (viewer.id === targetUserId) return null

  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'
  const baseClass = `rounded-lg font-medium transition-colors ${sizeClass} min-h-[36px] inline-flex items-center justify-center`
  const variantClass =
    variant === 'outline'
      ? 'border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white'
      : 'bg-indigo-600/80 text-white hover:bg-indigo-500'

  return (
    <button
      onClick={handleClick}
      disabled={loading || !checked}
      className={`${baseClass} ${following ? 'bg-slate-700/60 text-slate-300 border border-slate-600/50' : variantClass}`}
      title={following ? 'Unfollow' : 'Follow'}
    >
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  )
}
