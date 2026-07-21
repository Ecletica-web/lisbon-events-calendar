'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

/**
 * Handles Supabase auth redirects (OAuth + password recovery).
 * Exchanges ?code= for a session, then sends the user to `next`.
 */
function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('Completing sign-in…')

  useEffect(() => {
    let cancelled = false

    async function run() {
      const next = searchParams.get('next') || '/profile'
      if (!supabase) {
        setMessage('Auth is not configured')
        return
      }

      try {
        const code = searchParams.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          // Hash-based recovery / implicit flow — client already has detectSessionInUrl
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (!session) {
            // Give the client a moment to parse the URL hash
            await new Promise((r) => setTimeout(r, 400))
            const again = await supabase.auth.getSession()
            if (!again.data.session) {
              throw new Error('No session found. Open the link from your email again.')
            }
          }
        }

        if (!cancelled) router.replace(next)
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Sign-in failed')
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <p className="text-slate-300 text-sm">{message}</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
          <p className="text-slate-300 text-sm">Completing sign-in…</p>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  )
}
