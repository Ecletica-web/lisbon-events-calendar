'use client'

import { useState } from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { useUserActions } from '@/contexts/UserActionsContext'
import AuthGate from './AuthGate'

interface EventActionButtonsProps {
  eventId: string
  eventTitle: string
  className?: string
}

export default function EventActionButtons({
  eventId,
  eventTitle,
  className = '',
}: EventActionButtonsProps) {
  const auth = useSupabaseAuth()
  const user = auth?.user
  const isConfigured = auth?.isConfigured ?? false
  const actions = useUserActions()
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)

  if (!isConfigured) return null

  const isWishlisted = actions?.isWishlisted(eventId) ?? false
  const isLiked = actions?.isLiked(eventId) ?? false

  const handleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!actions || wishlistLoading) return
    setWishlistLoading(true)
    try {
      if (isWishlisted) {
        await actions.removeFromWishlist(eventId)
      } else {
        await actions.addToWishlist(eventId)
      }
    } finally {
      setWishlistLoading(false)
    }
  }

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!actions || likeLoading) return
    setLikeLoading(true)
    try {
      if (isLiked) {
        await actions.unlikeEvent(eventId)
      } else {
        await actions.likeEvent(eventId)
      }
    } finally {
      setLikeLoading(false)
    }
  }

  const btnClass = 'p-2 rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors disabled:opacity-50 min-w-[40px] min-h-[40px] flex items-center justify-center'
  const activeClass = 'bg-indigo-600/50 text-indigo-200 border-indigo-500/50'

  const wishlistBtn = (
    <button
      onClick={user ? handleWishlist : undefined}
      disabled={wishlistLoading}
      className={`${btnClass} ${isWishlisted ? activeClass : ''}`}
      title={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
    >
      {wishlistLoading ? (
        <span className="text-xs">...</span>
      ) : (
        <svg className="w-5 h-5" fill={isWishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      )}
    </button>
  )

  const likeBtn = (
    <button
      onClick={user ? handleLike : undefined}
      disabled={likeLoading}
      className={`${btnClass} ${isLiked ? activeClass : ''}`}
      title={isLiked ? 'Unlike' : 'Like'}
      aria-label={isLiked ? 'Unlike' : 'Like'}
    >
      {likeLoading ? (
        <span className="text-xs">...</span>
      ) : (
        <svg className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      )}
    </button>
  )

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {user ? (
        <>
          {wishlistBtn}
          {likeBtn}
        </>
      ) : (
        <>
          <AuthGate action="wishlistEvent" id={eventId} displayName={eventTitle} asWrapper>
            {wishlistBtn}
          </AuthGate>
          <AuthGate action="likeEvent" id={eventId} displayName={eventTitle} asWrapper>
            {likeBtn}
          </AuthGate>
        </>
      )}
    </div>
  )
}
