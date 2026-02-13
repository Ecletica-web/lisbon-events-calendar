import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import SessionProvider from '@/components/SessionProvider'
import { SupabaseAuthProvider } from '@/lib/auth/supabaseAuth'
import { UserActionsProvider } from '@/contexts/UserActionsContext'

export const metadata: Metadata = {
  title: 'Lisbon Events Calendar',
  description: 'Cultural events calendar for Lisbon',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden">
        <SessionProvider>
          <SupabaseAuthProvider>
            <UserActionsProvider>
              <Navigation />
              {children}
            </UserActionsProvider>
          </SupabaseAuthProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
