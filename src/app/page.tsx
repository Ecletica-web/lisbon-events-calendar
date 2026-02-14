'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'

export default function HomePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const supabaseAuth = useSupabaseAuth()
  const supabaseUser = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const isLoggedIn = (supabaseConfigured && !!supabaseUser) || (!!session?.user && (session.user as { id?: string })?.id !== 'guest')

  useEffect(() => {
    if (status === 'loading' && !supabaseConfigured) return
    if (isLoggedIn) {
      router.replace('/calendar')
    }
  }, [isLoggedIn, status, supabaseConfigured, router])

  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900/95 flex items-center justify-center">
        <div className="text-slate-400">Taking you to the calendar...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900/95 flex flex-col items-center justify-center px-4 pt-20 pb-24">
      <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent text-center mb-4">
        Lisbon Events Calendar
      </h1>
      <p className="text-slate-300 text-center max-w-md mb-8">
        Discover events in Lisbon. Sign in to get a personalised feed and save what you love.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/signup"
          className="min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-500 hover:to-purple-500 transition-all text-center"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="min-h-[48px] px-6 py-3 rounded-xl border border-slate-600/50 text-slate-200 font-medium hover:bg-slate-800/80 transition-all text-center"
        >
          Log in
        </Link>
        <Link
          href="/calendar"
          className="min-h-[48px] px-6 py-3 rounded-xl text-slate-400 hover:text-white text-sm font-medium text-center"
        >
          Browse calendar
        </Link>
      </div>
    </div>
  )
}
