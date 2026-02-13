'use client'

import { useState, useEffect, useRef } from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { useUserActions } from '@/contexts/UserActionsContext'
import AuthGate from './AuthGate'
import type { IntentType } from '@/lib/auth/pendingIntents'

interface EventActionButtonsProps {
  eventId: string
  eventTitle: string
  eventStart?: string
  compact?: boolean
  className?: string
}

const REMINDER_OPTIONS = [
  { label: '1 hour before', value: 1 },
  { label: '6 hours before', value: 6 },
  { label: '24 hours before', value: 24 },
  { label: 'Cancel reminder', value: 0 },
]

export default function EventActionButtons({
  eventId,
  eventTitle,
  eventStart,
  compact = false,
  className = '',
}: EventActionButtonsProps) {
  const auth = useSupabaseAuth()
  const user = auth?.user
  const isConfigured = auth?.isConfigured ?? false
  const actions = useUserActions()
  const [loading, setLoading] = useState<string | null>(null)
  const [showReminderMenu, setShowReminderMenu] = useState(false)
  const reminderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showReminderMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (reminderRef.current && !reminderRef.current.contains(e.target as Node)) {
        setShowReminderMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReminderMenu])

  if (!isConfigured) return null

  const isGoing = actions?.isGoing(eventId) ?? false
  const isInterested = actions?.isInterested(eventId) ?? false
  const isSaved = actions?.isWishlisted(eventId) ?? false
  const hasReminder = actions?.hasReminder(eventId) ?? false
  const isLiked = actions?.isLiked(eventId) ?? false

  const setLoadingFor = (key: string) => {
    setLoading(key)
    return () => setLoading(null)
  }

  const handleGoing = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!actions || loading) return
    const done = setLoadingFor('going')
    await actions.setGoing(eventId, !isGoing)
    done()
  }

  const handleInterested = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!actions || loading) return
    const done = setLoadingFor('interested')
    await actions.setInterested(eventId, !isInterested)
    done()
  }

  const handleSaved = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!actions || loading) return
    const done = setLoadingFor('saved')
    if (isSaved) await actions.removeFromWishlist(eventId)
    else await actions.addToWishlist(eventId)
    done()
  }

  const handleReminder = async (hoursBefore: number) => {
    setShowReminderMenu(false)
    if (!actions || loading) return
    const done = setLoadingFor('reminder')
    await actions.setReminder(eventId, hoursBefore > 0, hoursBefore || undefined)
    done()
  }

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!actions || loading) return
    const done = setLoadingFor('like')
    if (isLiked) await actions.unlikeEvent(eventId)
    else await actions.likeEvent(eventId)
    done()
  }

  const btnClass = 'p-2 rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors disabled:opacity-50 min-w-[40px] min-h-[40px] flex items-center justify-center'
  const activeClass = 'bg-indigo-600/50 text-indigo-200 border-indigo-500/50'

  const ActionBtn = ({
    onClick,
    active,
    loadingKey,
    title,
    ariaLabel,
    children,
    authAction,
  }: {
    onClick: (e: React.MouseEvent) => void
    active: boolean
    loadingKey: string
    title: string
    ariaLabel: string
    children: React.ReactNode
    authAction?: { action: IntentType; id: string; displayName: string }
  }) => {
    const btn = (
      <button
        onClick={user ? onClick : undefined}
        disabled={loading !== null}
        className={`${btnClass} ${active ? activeClass : ''}`}
        title={title}
        aria-label={ariaLabel}
      >
        {loading === loadingKey ? (
          <span className="text-xs">...</span>
        ) : (
          children
        )}
      </button>
    )
    if (!user && authAction) {
      return (
        <AuthGate action={authAction.action} id={authAction.id} displayName={authAction.displayName} asWrapper>
          {btn}
        </AuthGate>
      )
    }
    return btn
  }

  const reminderBtn = (
    <div className="relative" ref={reminderRef}>
      <ActionBtn
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (hasReminder) handleReminder(0)
          else setShowReminderMenu((v) => !v)
        }}
        active={hasReminder}
        loadingKey="reminder"
        title={hasReminder ? 'Remove reminder' : 'Set reminder'}
        ariaLabel={hasReminder ? 'Remove reminder' : 'Set reminder'}
        authAction={{ action: 'reminderEvent', id: eventId, displayName: eventTitle }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </ActionBtn>
      {showReminderMenu && (
        <div
          className="absolute bottom-full left-0 mb-1 py-2 rounded-lg bg-slate-800 border border-slate-600/50 shadow-xl z-50 min-w-[160px]"
          onClick={(e) => e.stopPropagation()}
        >
          {REMINDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleReminder(opt.value)}
              className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/60"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const buttons = (
    <>
      <ActionBtn
        onClick={handleGoing}
        active={isGoing}
        loadingKey="going"
        title={isGoing ? "I'm not going" : "I'm going"}
        ariaLabel={isGoing ? "I'm not going" : "I'm going"}
        authAction={{ action: 'goingEvent', id: eventId, displayName: eventTitle }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </ActionBtn>
      <ActionBtn
        onClick={handleInterested}
        active={isInterested}
        loadingKey="interested"
        title={isInterested ? 'Not interested' : 'Interested'}
        ariaLabel={isInterested ? 'Not interested' : 'Interested'}
        authAction={{ action: 'interestedEvent', id: eventId, displayName: eventTitle }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </ActionBtn>
      <ActionBtn
        onClick={handleSaved}
        active={isSaved}
        loadingKey="saved"
        title={isSaved ? 'Remove from saved' : 'Save event'}
        ariaLabel={isSaved ? 'Remove from saved' : 'Save event'}
        authAction={{ action: 'wishlistEvent', id: eventId, displayName: eventTitle }}
      >
        <svg className="w-5 h-5" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </ActionBtn>
      {!compact && reminderBtn}
      <ActionBtn
        onClick={handleLike}
        active={isLiked}
        loadingKey="like"
        title={isLiked ? 'Unlike' : 'Like'}
        ariaLabel={isLiked ? 'Unlike' : 'Like'}
        authAction={{ action: 'likeEvent', id: eventId, displayName: eventTitle }}
      >
        <svg className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </ActionBtn>
    </>
  )

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} onClick={(e) => e.stopPropagation()}>
      {buttons}
    </div>
  )
}
