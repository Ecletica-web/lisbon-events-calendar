'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchPromoters, fetchEvents } from '@/lib/eventsAdapter'

const IMAGE_PROXY = 'https://images.weserv.nl/?url='
function sanitize(url?: string): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (lower.includes('cdninstagram') || lower.includes('fbcdn.net')) {
    return IMAGE_PROXY + encodeURIComponent(url)
  }
  return url
}

export default function PromotersPage() {
  const [promoters, setPromoters] = useState<Awaited<ReturnType<typeof fetchPromoters>>>([])
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchEvents>>>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [p, e] = await Promise.all([fetchPromoters(), fetchEvents()])
        setPromoters(p)
        setEvents(e)
      } catch (err) {
        console.error('Failed to load promoters/events:', err)
        setPromoters([])
        setEvents([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const now = Date.now()
  const eventCountByPromoter = new Map<string, number>()
  for (const ev of events) {
    if (new Date(ev.start).getTime() < now) continue
    const keys = new Set(
      [
        ev.extendedProps.promoterId,
        ev.extendedProps.promoterName,
        ...(ev.extendedProps.promoterIds || []),
        ...(ev.extendedProps.nightActs || []).flatMap((a) => [a.promoterId, a.promoterName]),
      ].filter(Boolean) as string[]
    )
    for (const pid of keys) {
      eventCountByPromoter.set(pid, (eventCountByPromoter.get(pid) || 0) + 1)
    }
  }

  const q = searchQuery.trim().toLowerCase()
  const filtered = q
    ? promoters.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.instagram_handle || '').toLowerCase().includes(q) ||
          (p.description_short || '').toLowerCase().includes(q)
      )
    : promoters

  return (
    <div className="min-h-screen min-h-[100dvh] bg-pager-bg text-pager-fg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pt-14 sm:pt-16 pb-[env(safe-area-inset-bottom)]">
        <Link href="/calendar" className="pager-link text-xs uppercase tracking-wider mb-6 inline-block">
          ← Calendar
        </Link>

        <div className="flex items-end justify-between gap-4 mb-2 flex-wrap">
          <h1 className="pager-heading">PROMOTERS</h1>
          <Link href="/venues" className="text-[10px] uppercase tracking-wider text-pager-fg-muted hover:text-pager-fg underline">
            ← See venues
          </Link>
        </div>
        <p className="text-pager-fg-muted text-sm mb-4 sm:mb-6 max-w-xl">
          Organisers and collectives — not venues. Sourced from Fontes IG - Promoters + the promoters catalog.
        </p>

        <input
          type="text"
          placeholder="Search promoters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pager-input mb-6"
        />

        {loading ? (
          <div className="text-pager-fg-muted text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <p className="text-pager-fg-muted text-sm">
            {promoters.length === 0
              ? 'No promoters found. Check Fontes IG - Promoters and NEXT_PUBLIC_PROMOTERS_CSV_URL.'
              : 'No promoters match your search.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => {
              const count =
                eventCountByPromoter.get(p.promoter_id) ||
                eventCountByPromoter.get(p.slug) ||
                eventCountByPromoter.get(p.name) ||
                0
              return (
                <li key={p.promoter_id}>
                  <Link
                    href={`/promoters/${encodeURIComponent(p.slug)}`}
                    className="pager-panel flex items-center gap-3 sm:gap-4 py-3 px-3 sm:px-4 hover:bg-pager-muted transition-colors"
                  >
                    <img
                      src={sanitize(p.primary_image_url) || p.primary_image_url || '/lisboa.png'}
                      alt=""
                      className="w-12 h-12 object-cover flex-shrink-0 border-2 border-pager-strong grayscale contrast-125"
                      onError={(e) => {
                        e.currentTarget.src = '/lisboa.png'
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] uppercase tracking-widest text-pager-fg-faint">Promoter</div>
                      <span className="font-medium">{p.name}</span>
                      {p.description_short && (
                        <p className="text-pager-fg-muted text-sm truncate">{p.description_short}</p>
                      )}
                    </div>
                    <span className="text-pager-fg-faint text-xs flex-shrink-0">
                      {count} upcoming
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
