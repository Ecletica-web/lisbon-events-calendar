'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

/**
 * Client helper: current session access token for admin API calls.
 */
export function useAdminAuthHeaders() {
  const [ready, setReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase) {
      setReady(true)
      setIsAdmin(false)
      setEmail(null)
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const userEmail = session?.user?.email ?? null
    setEmail(userEmail)
    // Client cannot read ADMIN_EMAILS; /api/admin/me confirms
    if (!session?.access_token) {
      setIsAdmin(false)
      setReady(true)
      return
    }
    try {
      const res = await fetch('/api/admin/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setIsAdmin(res.ok)
    } catch {
      setIsAdmin(false)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
    if (!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh()
    })
    return () => sub.subscription.unsubscribe()
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

  return { ready, isAdmin, email, getAuthHeaders, refresh }
}
