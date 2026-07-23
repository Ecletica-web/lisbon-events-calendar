import type { Metadata, Viewport } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import ConditionalSessionProvider from '@/components/ConditionalSessionProvider'
import { SupabaseAuthProvider } from '@/lib/auth/supabaseAuth'
import { UserActionsProvider } from '@/contexts/UserActionsContext'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'

export const metadata: Metadata = {
  title: 'City Pager',
  description: 'Lisbon events — venues, promoters, and what’s on. Retro style.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="overflow-x-hidden" data-theme="night" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pager-theme');if(t==='day'||t==='night')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="overflow-x-hidden bg-pager-bg text-pager-fg font-mono">
        <ConditionalSessionProvider>
          <SupabaseAuthProvider>
            <ThemeProvider>
              <UserActionsProvider>
                <header className="sticky top-0 z-[99999] shrink-0">
                  <Navigation />
                </header>
                <main className="relative z-0 overflow-visible shrink-0">{children}</main>
              </UserActionsProvider>
            </ThemeProvider>
          </SupabaseAuthProvider>
        </ConditionalSessionProvider>
      </body>
    </html>
  )
}
