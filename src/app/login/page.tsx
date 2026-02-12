'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { FEATURE_FLAGS } from '@/lib/featureFlags'

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    if (!FEATURE_FLAGS.PROFILE_AUTH) router.replace('/')
  }, [router])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (res.status === 401 && data.error === 'NO_PASSWORD') {
        router.push(`/set-password?email=${encodeURIComponent(email)}`)
        return
      }

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Invalid email or password')
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        throw new Error('Could not sign in. Please try again.')
      }

      if (result?.ok) {
        router.push('/profile')
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'facebook') => {
    setError('')
    setLoading(true)
    try {
      await signIn(provider, { callbackUrl: '/profile' })
    } catch (err) {
      setError(`Failed to sign in with ${provider}. Please try again.`)
      console.error('OAuth error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center pt-16 px-4">
      <div className="max-w-md w-full p-6 md:p-8 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">Login</h1>
        <p className="text-sm text-gray-600 mb-8">
          Sign in to your account
        </p>
        
        {/* OAuth Buttons */}
        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuthSignIn('google')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300/50 text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
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
            <span className="font-medium">Continue with Google</span>
          </button>

          <button
            onClick={() => handleOAuthSignIn('facebook')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white px-4 py-3 rounded-xl hover:bg-[#166FE5] disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span className="font-medium">Continue with Facebook</span>
          </button>
        </div>

        <button
          onClick={async () => {
            setError('')
            setLoading(true)
            const result = await signIn('credentials', {
              email: 'guest@lisbon-events.guest',
              password: 'guest',
              redirect: false,
            })
            if (result?.error) setError(result.error)
            else if (result?.ok) router.push('/calendar')
            setLoading(false)
          }}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 text-slate-600 border-2 border-dashed border-gray-300 px-4 py-3 rounded-xl hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-all mb-6"
        >
          Continue as guest
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or</span>
          </div>
        </div>

        {/* Email/Password Login Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300/50 rounded-lg px-4 py-3 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-sm"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300/50 rounded-lg px-4 py-3 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-sm"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg font-medium"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-gray-500">
          Signed up with email only?{' '}
          <Link href="/set-password" className="text-blue-600 hover:underline">
            Set your password
          </Link>
        </p>
      </div>
    </div>
  )
}
