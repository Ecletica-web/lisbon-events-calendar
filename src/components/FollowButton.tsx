'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { FEATURE_FLAGS } from '@/lib/featureFlags'

interface FollowButtonProps {
  type: 'tag' | 'venue' | 'source' | 'artist'
  normalizedValue: string
  displayValue: string
  size?: 'sm' | 'md'
  variant?: 'default' | 'outline'
}

export default function FollowButton({
  type,
  normalizedValue,
  displayValue,
  size = 'sm',
  variant = 'outline',
}: FollowButtonProps) {
  const { data: session, status } = useSession()
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!FEATURE_FLAGS.PROFILE_AUTH || status !== 'authenticated' || !session?.user) return
    fetch('/api/follows')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.follows) {
          const found = data.follows.some(
            (f: any) => f.type === type && f.normalized_value === normalizedValue
          )
          setIsFollowing(found)
        }
        setChecked(true)
      })
      .catch(() => setChecked(true))
  }, [session, status, type, normalizedValue])

  const handleClick = async () => {
    if (!session?.user || loading) return
    setLoading(true)
    try {
      if (isFollowing) {
        const res = await fetch('/api/follows')
        const data = await res.json()
        const follow = data?.follows?.find(
          (f: any) => f.type === type && f.normalized_value === normalizedValue
        )
        if (follow) {
          const del = await fetch(`/api/follows?id=${follow.id}`, { method: 'DELETE' })
          if (del.ok) setIsFollowing(false)
        }
      } else {
        const res = await fetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, normalizedValue, displayValue }),
        })
        if (res.ok) setIsFollowing(true)
      }
    } catch (e) {
      console.error('Follow error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!FEATURE_FLAGS.PROFILE_AUTH) return null
  if (status !== 'authenticated' || !session?.user) return null
  if ((session?.user as any)?.id === 'guest') return null

  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  const baseClass = `border-2 border-terminus-strong font-medium transition-colors ${sizeClass}`
  const variantClass =
    variant === 'outline'
      ? 'bg-terminus-bg text-terminus-fg hover:bg-terminus-muted'
      : 'bg-terminus-accent text-terminus-accent-fg hover:opacity-90'

  return (
    <button
      onClick={handleClick}
      disabled={loading || !checked}
      className={`${baseClass} ${isFollowing ? 'bg-terminus-accent text-terminus-accent-fg' : variantClass}`}
      title={isFollowing ? `Unfollow ${displayValue}` : `Follow ${displayValue}`}
    >
      {loading ? '...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}
