'use client'

import { useState, type ReactNode } from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { savePendingIntent, executePendingIntents, type IntentType } from '@/lib/auth/pendingIntents'

interface AuthGateProps {
  action: IntentType
  id: string
  displayName?: string
  children: ReactNode
  onAction?: () => void | Promise<void>
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
  const auth = useSupabaseAuth()
  const user = auth?.user
  const isConfigured = auth?.isConfigured ?? false
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

  const actionLabel =
    action === 'followVenue' ? 'follow venues' :
    action === 'followPromoter' ? 'follow promoters' :
    action === 'wishlistEvent' ? 'save events' :
    action === 'likeEvent' ? 'like events' :
    action === 'goingEvent' ? 'mark events as going' :
    action === 'interestedEvent' ? 'mark events as interested' :
    action === 'reminderEvent' ? 'set reminders' : 'do this'

  const modal = showModal && (
    <AuthGateModal
      onClose={() => setShowModal(false)}
      actionLabel={actionLabel}
      onSuccess={() => {
        setShowModal(false)
        executePendingIntents()
      }}
    />
  )

  if (asWrapper) {
    return (
      <>
        <div onClick={handleClick} className="contents">
          {children}
        </div>
        {modal}
      </>
    )
  }

  return (
    <>
      <div onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick(e as any)}>
        {children}
      </div>
      {modal}
    </>
  )
}

function AuthGateModal({
  onClose,
  actionLabel,
  onSuccess,
}: {
  onClose: () => void
  actionLabel: string
  onSuccess: () => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const auth = useSupabaseAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const res = await auth?.signUp(email, password, name || undefined)
        if (res?.error) setError(res.error)
        else onSuccess()
      } else {
        const res = await auth?.signIn(email, password)
        if (res?.error) setError(res.error)
        else onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-title"
    >
      <div
        className="w-full max-w-md bg-slate-800/98 backdrop-blur-xl border-l border-slate-700/50 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'authSlideIn 0.25s ease-out' }}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 id="auth-gate-title" className="text-lg font-bold text-white">
              Sign in to {actionLabel}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-2 mb-4 p-1 bg-slate-900/80 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'login' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900/80 border border-slate-600/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>
            {mode === 'signup' && (
              <div>
                <label htmlFor="auth-name" className="block text-sm font-medium text-slate-300 mb-1">Name (optional)</label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-900/80 border border-slate-600/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Your name"
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900/80 border border-slate-600/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder={mode === 'signup' ? 'Min 6 characters' : '••••••••'}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-500 hover:to-purple-500 transition-all disabled:opacity-50"
            >
              {loading ? '...' : mode === 'login' ? 'Log in' : 'Sign up'}
            </button>
          </form>

          <button
            type="button"
            onClick={onClose}
            className="w-full mt-4 py-2 text-slate-400 hover:text-slate-200 text-sm"
          >
            Continue browsing
          </button>
        </div>
      </div>
    </div>
  )
}
