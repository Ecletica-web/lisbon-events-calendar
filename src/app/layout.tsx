import type { Metadata, Viewport } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import FeedbackButton from '@/components/FeedbackButton'
import ConditionalSessionProvider from '@/components/ConditionalSessionProvider'
import { SupabaseAuthProvider } from '@/lib/auth/supabaseAuth'
import { UserActionsProvider } from '@/contexts/UserActionsContext'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'

const APP_NAME = 'Terminus'
const APP_DESCRIPTION = 'Lisbon events — venues, promoters, and what’s on. Retro style.'

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
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
            __html: `(function(){try{var t=localStorage.getItem('terminus-theme');if(t==='day'||t==='night')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="overflow-x-hidden bg-terminus-bg text-terminus-fg font-mono">
        <ConditionalSessionProvider>
          <SupabaseAuthProvider>
            <ThemeProvider>
              <UserActionsProvider>
                <header className="sticky top-0 z-[99999] shrink-0">
                  <Navigation />
                </header>
                <main className="relative z-0 overflow-visible shrink-0">{children}</main>
                <FeedbackButton />
              </UserActionsProvider>
            </ThemeProvider>
          </SupabaseAuthProvider>
        </ConditionalSessionProvider>
      </body>
    </html>
  )
}
