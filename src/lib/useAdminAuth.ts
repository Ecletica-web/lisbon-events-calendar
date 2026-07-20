'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

const READY_TIMEOUT_MS = 4000

/**
 * Client helper: current session access token for admin API calls.
 * Always resolves `ready` (timeout + try/finally) so the UI never sticks on
 * "Checking admin access…".
 */
export function useAdminAuthHeaders() {
  const [ready, setReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    if (!supabase) {
      setIsAdmin(false)
      setEmail(null)
      setError('Supabase is not configured in this environment')
      setReady(true)
      return
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        setError(sessionError.message)
        setIsAdmin(false)
        setEmail(null)
        return
      }

      const userEmail = session?.user?.email ?? null
      setEmail(userEmail)

      if (!session?.access_token) {
        setIsAdmin(false)
        return
      }

      const res = await fetch('/api/admin/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        setIsAdmin(true)
        return
      }
      setIsAdmin(false)
      const body = await res.json().catch(() => ({}))
      if (res.status === 403) {
        setError(
          `Signed in as ${userEmail}, but that email is not in ADMIN_EMAILS`
        )
      } else if (res.status === 503) {
        setError(
          typeof body.error === 'string'
            ? body.error
            : 'Admin API not configured (ADMIN_EMAILS / Supabase service role)'
        )
      } else if (res.status === 401) {
        setError('Session invalid — please log in again')
      } else {
        setError(typeof body.error === 'string' ? body.error : `Admin check failed (${res.status})`)
      }
    } catch (err) {
      setIsAdmin(false)
      setError(err instanceof Error ? err.message : 'Admin check failed')
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const watchdog = window.setTimeout(() => {
      if (!cancelled) setReady(true)
    }, READY_TIMEOUT_MS)

    void refresh().finally(() => {
      window.clearTimeout(watchdog)
    })

    if (!supabase) {
      return () => {
        cancelled = true
        window.clearTimeout(watchdog)
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh()
    })
    return () => {
      cancelled = true
      window.clearTimeout(watchdog)
      sub.subscription.unsubscribe()
    }
  }, [refresh])

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!supabase) return {}
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}
  }, [])

  return { ready, isAdmin, email, error, getAuthHeaders, refresh }
}
