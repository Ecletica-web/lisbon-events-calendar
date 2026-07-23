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
  const isLoggedIn =
    (supabaseConfigured && !!supabaseUser) ||
    (!!session?.user && (session.user as { id?: string })?.id !== 'guest')

  useEffect(() => {
    if (status === 'loading' && !supabaseConfigured) return
    if (isLoggedIn) {
      router.replace('/calendar')
    }
  }, [isLoggedIn, status, supabaseConfigured, router])

  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-pager-bg flex items-center justify-center">
        <div className="text-pager-fg-muted font-mono text-sm">Loading calendar...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-pager-bg flex flex-col items-center justify-center px-4 pt-20 pb-24">
      <h1 className="pager-heading text-center mb-4 pager-cursor">PAGER</h1>
      <p className="text-pager-fg-muted text-center max-w-md mb-8 text-sm">
        Lisbon events — venues, promoters, and what&apos;s on. Sign in for a personal feed.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/signup" className="pager-btn pager-btn-primary min-h-[48px] px-6 py-3 text-xs uppercase tracking-wider">
          Sign up
        </Link>
        <Link href="/login" className="pager-btn min-h-[48px] px-6 py-3 text-xs uppercase tracking-wider">
          Log in
        </Link>
        <Link
          href="/calendar"
          className="min-h-[48px] px-6 py-3 text-xs uppercase tracking-wider text-pager-fg-muted hover:text-pager-fg text-center flex items-center justify-center"
        >
          Browse calendar →
        </Link>
      </div>
    </div>
  )
}
