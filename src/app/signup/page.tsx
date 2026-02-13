'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'

export default function SignupPage() {
  const router = useRouter()
  const supabaseAuth = useSupabaseAuth()
  const supabaseSignUp = supabaseAuth?.signUp
  const supabaseSignInWithOAuth = supabaseAuth?.signInWithOAuth
  const supabaseUser = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false

  useEffect(() => {
    if (!FEATURE_FLAGS.PROFILE_AUTH) router.replace('/')
  }, [router])

  useEffect(() => {
    if (supabaseConfigured && supabaseUser) router.push('/profile')
  }, [supabaseConfigured, supabaseUser, router])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailOnly, setEmailOnly] = useState(false)

  const handleEmailOnlySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (supabaseConfigured) {
      setError('With Supabase, use email + password to sign up.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Signup failed')
      router.push(`/set-password?email=${encodeURIComponent(email)}`)
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.')
      console.error('Signup error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      if (supabaseConfigured && supabaseSignUp) {
        const { error: err } = await supabaseSignUp(email, password, name || undefined)
        if (err) throw new Error(err)
        router.push('/profile')
        return
      }
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || undefined }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Signup failed')
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.ok) router.push('/profile')
      else router.push('/login?signup=success')
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.')
      console.error('Signup error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'facebook') => {
    setError('')
    setLoading(true)
    try {
      if (supabaseConfigured && supabaseSignInWithOAuth) {
        const { error: err } = await supabaseSignInWithOAuth(provider)
        if (err) throw new Error(err)
        return
      }
      await signIn(provider, { callbackUrl: '/profile' })
    } catch (err: any) {
      setError(err?.message || `Failed to sign in with ${provider}. Please try again.`)
      console.error('OAuth error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800/95 to-slate-900 flex items-center justify-center pt-16 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-16">
      <div className="max-w-md w-full p-4 sm:p-6 md:p-8 bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 text-slate-100">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Sign Up</h1>
        <p className="text-sm text-slate-400 mb-8">
          Create a new account
        </p>
        
        {/* OAuth Buttons */}
        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuthSignIn('google')}
            disabled={loading}
            className="w-full min-h-[44px] flex items-center justify-center gap-3 bg-slate-700/50 border border-slate-600/50 text-slate-200 px-4 py-3 rounded-xl hover:bg-slate-700/80 hover:border-slate-500 disabled:opacity-50 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="font-medium">Sign up with Google</span>
          </button>

          <button
            onClick={() => handleOAuthSignIn('facebook')}
            disabled={loading}
            className="w-full min-h-[44px] flex items-center justify-center gap-3 bg-[#1877F2] text-white px-4 py-3 rounded-xl hover:bg-[#166FE5] disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span className="font-medium">Sign up with Facebook</span>
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-800/80 text-slate-500">Or</span>
          </div>
        </div>

        {/* Toggle: Full signup vs email only (NextAuth only) */}
        {!supabaseConfigured && (
        <div className="flex gap-2 mb-4 p-1 bg-slate-700/50 rounded-lg">
          <button
            type="button"
            onClick={() => setEmailOnly(false)}
            className={`flex-1 min-w-0 py-3 sm:py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[44px] ${!emailOnly ? 'bg-slate-600/80 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Email + password
          </button>
          <button
            type="button"
            onClick={() => setEmailOnly(true)}
            className={`flex-1 min-w-0 py-3 sm:py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[44px] ${emailOnly ? 'bg-slate-600/80 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Email only
          </button>
        </div>
        )}

        {/* Signup Form */}
        {emailOnly ? (
          <form onSubmit={handleEmailOnlySubmit} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-slate-200">Name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-slate-200">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                placeholder="your@email.com"
              />
            </div>
            {error && <div className="text-red-400 text-sm">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white px-4 py-3 rounded-xl hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all font-medium"
            >
              {loading ? 'Creating account...' : 'Sign up with email'}
            </button>
            <p className="text-xs text-slate-500">
              You&apos;ll set a password on the next screen
            </p>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium text-slate-200">Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-slate-200">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-slate-200">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-slate-200">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border border-slate-600/50 rounded-lg px-4 py-3 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              placeholder="Confirm your password"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white px-4 py-3 rounded-xl hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all font-medium"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
        )}

        <p className="mt-4 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
