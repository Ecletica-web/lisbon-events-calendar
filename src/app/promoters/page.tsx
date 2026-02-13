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
    const pid = ev.extendedProps.promoterId || ev.extendedProps.promoterName
    if (!pid) continue
    if (new Date(ev.start).getTime() >= now) {
      eventCountByPromoter.set(pid, (eventCountByPromoter.get(pid) || 0) + 1)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pt-20 sm:pt-24 pb-[env(safe-area-inset-bottom)]">
        <Link
          href="/calendar"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Calendar
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Promoters
        </h1>

        {loading ? (
          <div className="text-slate-400">Loading...</div>
        ) : promoters.length === 0 ? (
          <p className="text-slate-400">No promoters found.</p>
        ) : (
          <ul className="space-y-2">
            {promoters.map((p) => {
              const count = eventCountByPromoter.get(p.promoter_id) || eventCountByPromoter.get(p.slug) || 0
              return (
                <li key={p.promoter_id}>
                  <Link
                    href={`/promoters/${encodeURIComponent(p.slug)}`}
                    className="flex items-center gap-3 sm:gap-4 py-3 px-3 sm:px-4 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 transition-colors"
                  >
                    <img
                      src={sanitize(p.primary_image_url) || p.primary_image_url || '/lisboa.png'}
                      alt=""
                      className="w-12 h-12 rounded object-cover flex-shrink-0"
                      onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{p.name}</span>
                      {p.description_short && (
                        <p className="text-slate-400 text-sm truncate">{p.description_short}</p>
                      )}
                    </div>
                    <span className="text-slate-400 text-sm flex-shrink-0">
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
