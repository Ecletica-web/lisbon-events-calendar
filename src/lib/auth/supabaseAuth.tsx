'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { executePendingIntents } from '@/lib/auth/pendingIntents'

export interface SupabaseUser {
  id: string
  email: string
  name?: string
}

interface SupabaseAuthContextValue {
  user: SupabaseUser | null
  loading: boolean
  signUp: (email: string, password: string, name?: string) => Promise<{ error?: string }>
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signInWithOAuth: (provider: 'google' | 'facebook') => Promise<{ error?: string }>
  signOut: () => Promise<void>
  isConfigured: boolean
}

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null)

export function useSupabaseAuth() {
  const ctx = useContext(SupabaseAuthContext)
  return ctx
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const isConfigured = isSupabaseConfigured()

  useEffect(() => {
    if (!supabase || !isConfigured) {
      setLoading(false)
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name,
          })
          if (event === 'SIGNED_IN') {
            await executePendingIntents()
          }
        } else {
          setUser(null)
        }
        setLoading(false)
      }
    )

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        })
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [isConfigured])

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      if (!supabase) return { error: 'Auth not configured' }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      })
      return { error: error?.message }
    },
    []
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: 'Auth not configured' }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message }
    },
    []
  )

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
  }, [])

  const signInWithOAuth = useCallback(
    async (provider: 'google' | 'facebook') => {
      if (!supabase) return { error: 'Auth not configured' }
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/profile`
          : undefined
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === 'facebook' ? 'facebook' : 'google',
        options: redirectTo ? { redirectTo } : undefined,
      })
      return { error: error?.message }
    },
    []
  )

  const value: SupabaseAuthContextValue = {
    user,
    loading,
    signUp,
    signIn,
    signInWithOAuth,
    signOut,
    isConfigured,
  }

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  )
}
