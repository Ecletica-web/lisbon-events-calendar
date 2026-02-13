import type { Metadata, Viewport } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import SessionProvider from '@/components/SessionProvider'
import { SupabaseAuthProvider } from '@/lib/auth/supabaseAuth'
import { UserActionsProvider } from '@/contexts/UserActionsContext'

export const metadata: Metadata = {
  title: 'Lisbon Events Calendar',
  description: 'Cultural events calendar for Lisbon',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
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
              <header className="sticky top-0 z-[99999] shrink-0">
                <Navigation />
              </header>
              <main className="relative z-0 overflow-visible shrink-0">
                {children}
              </main>
            </UserActionsProvider>
          </SupabaseAuthProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
