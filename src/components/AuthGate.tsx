'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { savePendingIntent, type IntentType } from '@/lib/auth/pendingIntents'

interface AuthGateProps {
  action: IntentType
  id: string
  displayName?: string
  children: ReactNode
  onAction?: () => void | Promise<void>
  /** When true, always render children and handle gate via onAction */
  asWrapper?: boolean
}

export default function AuthGate({
  action,
  id,
  displayName,
  children,
  onAction,
  asWrapper = false,
}: AuthGateProps) {
  const { user, isConfigured } = useSupabaseAuth()
  const [showModal, setShowModal] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isConfigured) {
      if (onAction) await onAction()
      return
    }

    if (user) {
      if (onAction) await onAction()
      return
    }

    savePendingIntent({ type: action, id, displayName })
    setShowModal(true)
  }

  if (asWrapper) {
    return (
      <>
        <div onClick={handleClick} className="contents">
          {children}
        </div>
        {showModal && (
          <AuthGateModal
            onClose={() => setShowModal(false)}
            actionLabel={
              action === 'followVenue'
                ? 'follow venues'
                : action === 'followPromoter'
                  ? 'follow promoters'
                  : action === 'wishlistEvent'
                    ? 'save events to your wishlist'
                    : 'like events'
            }
          />
        )}
      </>
    )
  }

  return (
    <>
      <div onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick(e as any)}>
        {children}
      </div>
      {showModal && (
        <AuthGateModal
          onClose={() => setShowModal(false)}
          actionLabel={
            action === 'followVenue'
              ? 'follow venues'
              : action === 'followPromoter'
                ? 'follow promoters'
                : action === 'wishlistEvent'
                  ? 'save events to your wishlist'
                  : 'like events'
          }
        />
      )}
    </>
  )
}

function AuthGateModal({
  onClose,
  actionLabel,
}: {
  onClose: () => void
  actionLabel: string
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-title"
    >
      <div
        className="bg-slate-800/95 backdrop-blur-xl rounded-2xl p-6 max-w-sm w-full border border-slate-700/50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-gate-title" className="text-lg font-bold text-white mb-2">
          Sign up to {actionLabel}
        </h2>
        <p className="text-slate-300 text-sm mb-6">
          Create an account to {actionLabel} and get notifications.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/signup"
            className="w-full min-h-[44px] flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-500 hover:to-purple-500 transition-all"
            onClick={onClose}
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="w-full min-h-[44px] flex items-center justify-center rounded-xl border border-slate-600/50 text-slate-200 font-medium hover:bg-slate-700/80 transition-all"
            onClick={onClose}
          >
            Log in
          </Link>
          <button
            onClick={onClose}
            className="w-full min-h-[44px] text-slate-400 hover:text-slate-200 text-sm"
          >
            Continue browsing
          </button>
        </div>
      </div>
    </div>
  )
}
