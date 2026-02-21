'use client'

import { ReactNode } from 'react'
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

/**
 * Always wrap with NextAuth SessionProvider so useSession() never returns undefined
 * (required for prerender/build). When Supabase is configured, login/signup use Supabase;
 * session context is still provided for any component that calls useSession().
 */
export default function ConditionalSessionProvider({ children }: { children: ReactNode }) {
  try {
    return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
  } catch (error) {
    console.error('SessionProvider error:', error)
    return <>{children}</>
  }
}
