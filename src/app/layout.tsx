import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import SessionProvider from '@/components/SessionProvider'

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
    <html lang="en">
      <body>
        <SessionProvider>
          <Navigation />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
