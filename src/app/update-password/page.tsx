'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'

/**
 * Set a new password after clicking the Supabase recovery email link
 * (lands here via /auth/callback?next=/update-password).
 */
export default function UpdatePasswordPage() {
  const router = useRouter()
  const auth = useSupabaseAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!FEATURE_FLAGS.PROFILE_AUTH) router.replace('/')
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!auth?.updatePassword) {
      setError('Auth not configured')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await auth.updatePassword(password)
      if (err) throw new Error(err)
      setDone(true)
      setTimeout(() => router.push('/admin'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center pt-16 px-4 pb-8">
      <div className="max-w-md w-full p-6 bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-slate-700/50">
        <h1 className="text-2xl font-bold mb-2 text-white">Set a new password</h1>
        <p className="text-sm text-slate-400 mb-6">
          Choose a new password for your account
          {auth?.user?.email ? (
            <>
              {' '}
              (<span className="text-slate-300">{auth.user.email}</span>)
            </>
          ) : null}
          .
        </p>

        {!auth?.user && (
          <p className="text-sm text-amber-200/90 mb-4">
            No recovery session yet. Open the link from your reset email again, or{' '}
            <Link href="/login" className="text-indigo-400 underline">
              go back to login
            </Link>
            .
          </p>
        )}

        {done ? (
          <p className="text-emerald-400 text-sm">Password updated. Redirecting…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm text-slate-200">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm text-slate-200">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !auth?.user}
              className="w-full min-h-[44px] bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
