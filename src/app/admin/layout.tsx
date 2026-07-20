'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

const NAV = [
  { href: '/admin', label: 'Hub', exact: true },
  { href: '/admin/scrapers', label: 'Scrapers' },
  { href: '/admin/events-raw', label: 'Events Raw' },
  { href: '/admin/event-review', label: 'Review' },
  { href: '/admin/processed', label: 'Processed' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { ready, isAdmin, email } = useAdminAuthHeaders()

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-6xl mx-auto px-4 pt-16 pb-8">
        <div className="mb-6 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-400 hover:text-white text-sm">
              ← Back
            </Link>
            <h1 className="text-xl font-semibold text-white">Admin</h1>
          </div>
          {ready && (
            <span className="text-xs text-slate-400">
              {isAdmin ? email : 'Not signed in as admin'}
            </span>
          )}
        </div>

        <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-700 pb-3">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {!ready ? (
          <p className="text-slate-400 text-sm">Checking admin access…</p>
        ) : !isAdmin ? (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 p-6 text-amber-100">
            <p className="font-medium mb-2">Admin access required</p>
            <p className="text-sm text-amber-200/80 mb-4">
              Sign in with an email listed in <code className="text-amber-100">ADMIN_EMAILS</code>,
              then reload this page.
            </p>
            <Link
              href="/login"
              className="inline-block px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500"
            >
              Go to login
            </Link>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
