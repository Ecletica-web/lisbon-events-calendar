'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { fetchPromoters, fetchEvents } from '@/lib/eventsAdapter'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import { getCategoryColor } from '@/lib/categoryColors'
import FollowPromoterButton from '@/components/FollowPromoterButton'

const IMAGE_PROXY = 'https://images.weserv.nl/?url='
function sanitize(url?: string): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (lower.includes('cdninstagram') || lower.includes('fbcdn.net')) {
    return IMAGE_PROXY + encodeURIComponent(url)
  }
  return url
}

export default function PromoterDetailPage() {
  const params = useParams()
  const slug = typeof params.slug === 'string' ? params.slug : ''

  const [promoters, setPromoters] = useState<Awaited<ReturnType<typeof fetchPromoters>>>([])
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [p, e] = await Promise.all([fetchPromoters(), fetchEvents()])
        setPromoters(p)
        setEvents(e)
      } catch (err) {
        console.error('Failed to load:', err)
        setPromoters([])
        setEvents([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const promoter = promoters.find((p) => p.slug === slug || p.promoter_id === slug)
  const now = Date.now()
  const upcomingEvents = events
    .filter((e) => {
      const pid = e.extendedProps.promoterId || e.extendedProps.promoterName
      const matches = pid === promoter?.promoter_id || pid === promoter?.slug || pid === slug
      return matches && new Date(e.start).getTime() >= now
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const displayName = promoter?.name || slug

  if (!promoter && !loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">Promoter not found</h1>
          <Link href="/promoters" className="text-indigo-400 hover:text-indigo-300">
            ← Back to Promoters
          </Link>
        </div>
      </div>
    )
  }

  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(d)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link
          href="/promoters"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Promoters
        </Link>

        {promoter && (
          <div className="mb-8 rounded-lg bg-slate-800/60 border border-slate-700/50 overflow-hidden">
            <div className="flex flex-col md:flex-row gap-4 p-4">
              <img
                src={sanitize(promoter.primary_image_url) || promoter.primary_image_url || '/lisboa.png'}
                alt=""
                className="w-full md:w-48 h-32 object-cover rounded-lg flex-shrink-0"
                onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
              />
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    {displayName}
                  </h1>
                  <FollowPromoterButton
                    promoterId={(promoter.promoter_id || promoter.slug || slug).toString()}
                    displayName={displayName}
                    size="md"
                    variant="default"
                  />
                </div>
                {promoter.description_short && (
                  <p className="text-slate-300 mt-2">{promoter.description_short}</p>
                )}
                <div className="flex gap-4 mt-3 text-sm">
                  {promoter.website_url && (
                    <a
                      href={promoter.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Website
                    </a>
                  )}
                  {promoter.instagram_handle && (
                    <a
                      href={`https://instagram.com/${promoter.instagram_handle.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Instagram
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold mb-4">Upcoming events</h2>

        {loading ? (
          <div className="text-slate-400">Loading events...</div>
        ) : upcomingEvents.length === 0 ? (
          <p className="text-slate-400">No upcoming events.</p>
        ) : (
          <ul className="space-y-4">
            {upcomingEvents.map((event) => {
              const categoryColor = getCategoryColor(event.extendedProps.category)
              return (
                <li
                  key={event.id}
                  className="rounded-lg bg-slate-800/60 border border-slate-700/50 overflow-hidden"
                >
                  <div className="p-4 flex flex-col sm:flex-row gap-4">
                    <img
                      src={event.extendedProps.imageUrl || '/lisboa.png'}
                      alt=""
                      className="w-full sm:w-24 h-40 sm:h-24 object-cover rounded flex-shrink-0"
                      onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">{event.title}</h3>
                      <p className="text-slate-400 text-sm mt-1">
                        {formatDate(new Date(event.start))}
                        {event.end && ` – ${formatDate(new Date(event.end))}`}
                      </p>
                      {event.extendedProps.venueName && (
                        <p className="text-slate-300 text-sm mt-1">{event.extendedProps.venueName}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {event.extendedProps.category && (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium text-white"
                            style={{ backgroundColor: categoryColor }}
                          >
                            {event.extendedProps.category}
                          </span>
                        )}
                        {event.extendedProps.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
