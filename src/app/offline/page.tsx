import Link from 'next/link'

export const metadata = {
  title: 'Offline — Terminus',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <h1 className="terminus-heading mb-4">OFFLINE</h1>
      <p className="text-terminus-fg-muted text-sm max-w-sm mb-8">
        No connection. Cached pages may still work — reconnect to load live events.
      </p>
      <Link href="/calendar" className="terminus-link text-xs uppercase tracking-wider">
        Try calendar
      </Link>
    </div>
  )
}
