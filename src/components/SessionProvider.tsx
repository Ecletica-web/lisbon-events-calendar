'use client'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'

export default function SessionProvider({ children }: { children: ReactNode }) {
  try {
    return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
  } catch (error) {
    console.error('SessionProvider error:', error)
    // Fallback: render children without session provider if there's an error
    return <>{children}</>
  }
}
