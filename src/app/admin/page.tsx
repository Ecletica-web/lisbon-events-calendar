'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

interface HubCounts {
  queuedRuns: number
  pendingReviews: number
  postsThisWeek: number
  workerHeartbeatAt: string | null
}

function workerAgeLabel(iso: string | null): string {
  if (!iso) return 'Worker never seen — start with npm run worker'
  const ageMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ageMs / 60000)
  if (mins < 2) return `Worker online (heartbeat ${mins}m ago)`
  if (mins < 60) return `Worker stale (${mins}m ago)`
  return `Worker offline (last ${Math.round(mins / 60)}h ago)`
}

export default function AdminHubPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [counts, setCounts] = useState<HubCounts | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    ;(async () => {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/hub', { headers })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || res.statusText)
        return
      }
      setCounts(await res.json())
    })()
  }, [isAdmin, getAuthHeaders])

  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (!counts) return <p className="text-slate-400 text-sm">Loading…</p>

  const cards = [
    { href: '/admin/scrapers', label: 'Queued runs', value: counts.queuedRuns },
    { href: '/admin/event-review', label: 'Pending reviews', value: counts.pendingReviews },
    { href: '/admin/events-raw', label: 'Posts this week', value: counts.postsThisWeek },
  ]

  return (
    <div className="space-y-6">
      <p
        className={`text-sm ${
          counts.workerHeartbeatAt &&
          Date.now() - new Date(counts.workerHeartbeatAt).getTime() < 120000
            ? 'text-emerald-400'
            : 'text-amber-400'
        }`}
      >
        {workerAgeLabel(counts.workerHeartbeatAt)}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-slate-700 bg-slate-800/60 p-5 hover:border-indigo-500 transition"
          >
            <div className="text-3xl font-semibold text-white">{c.value}</div>
            <div className="text-sm text-slate-400 mt-1">{c.label}</div>
          </Link>
        ))}
      </div>
      <div className="text-sm text-slate-400 space-y-1">
        <p>
          <strong className="text-slate-200">Watchlist + Processed Events</strong> live in Google
          Sheets (edit there or via Scrapers / Review approve).
        </p>
        <p>
          <strong className="text-slate-200">Raw posts + AI tiers + review queue</strong> live in
          Supabase — browse under Events Raw / Review.
        </p>
      </div>
    </div>
  )
}
