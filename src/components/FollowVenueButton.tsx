'use client'

import { useState } from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { useUserActions } from '@/contexts/UserActionsContext'
import AuthGate from './AuthGate'

interface FollowVenueButtonProps {
  venueId: string
  displayName: string
  size?: 'sm' | 'md'
  variant?: 'default' | 'outline'
}

export default function FollowVenueButton({
  venueId,
  displayName,
  size = 'sm',
  variant = 'outline',
}: FollowVenueButtonProps) {
  const auth = useSupabaseAuth()
  const user = auth?.user
  const isConfigured = auth?.isConfigured ?? false
  const actions = useUserActions()
  const [loading, setLoading] = useState(false)

  if (!isConfigured) return null

  const isFollowing = actions?.isFollowingVenue(venueId) ?? false
  const key = (venueId || '').toLowerCase().trim()

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!actions || loading) return
    setLoading(true)
    try {
      if (isFollowing) {
        await actions.unfollowVenue(key)
      } else {
        await actions.followVenue(key)
      }
    } finally {
      setLoading(false)
    }
  }

  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  const baseClass = `rounded-lg font-medium transition-colors ${sizeClass}`
  const variantClass =
    variant === 'outline'
      ? 'border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white'
      : 'bg-indigo-600/80 text-white hover:bg-indigo-500'

  const button = (
    <button
      onClick={user ? handleClick : undefined}
      disabled={loading}
      className={`${baseClass} ${isFollowing ? 'bg-indigo-600/50 text-indigo-200 border-indigo-500/50' : variantClass}`}
      title={isFollowing ? `Unfollow ${displayName}` : `Follow ${displayName}`}
    >
      {loading ? '...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  )

  if (user) {
    return button
  }

  return (
    <AuthGate action="followVenue" id={key} displayName={displayName} asWrapper>
      {button}
    </AuthGate>
  )
}
