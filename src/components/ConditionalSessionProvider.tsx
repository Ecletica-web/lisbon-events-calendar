'use client'

import { ReactNode } from 'react'
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

/**
 * When Supabase is configured we use it as the only auth source.
 * NextAuth is only loaded when Supabase env vars are missing (e.g. local dev without Supabase).
 */
export default function ConditionalSessionProvider({ children }: { children: ReactNode }) {
  const useSupabaseOnly = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  if (useSupabaseOnly) {
    return <>{children}</>
  }

  try {
    return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
  } catch (error) {
    console.error('SessionProvider error:', error)
    return <>{children}</>
  }
}
