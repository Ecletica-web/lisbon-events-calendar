'use client'

import { useEffect, useState } from 'react'

interface EventCountsData {
  goingCount: number
  interestedCount: number
}

export default function EventCounts({ eventId }: { eventId: string }) {
  const [counts, setCounts] = useState<EventCountsData | null>(null)

  useEffect(() => {
    if (!eventId) return
    fetch(`/api/events/${encodeURIComponent(eventId)}/counts`)
      .then((r) => r.json())
      .then((d) =>
        setCounts({
          goingCount: typeof d.goingCount === 'number' ? d.goingCount : 0,
          interestedCount: typeof d.interestedCount === 'number' ? d.interestedCount : 0,
        })
      )
      .catch(() => setCounts({ goingCount: 0, interestedCount: 0 }))
  }, [eventId])

  if (!counts || (counts.goingCount === 0 && counts.interestedCount === 0)) return null

  return (
    <div className="flex items-center gap-3 text-xs text-slate-400">
      {counts.goingCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {counts.goingCount} going
        </span>
      )}
      {counts.interestedCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {counts.interestedCount} interested
        </span>
      )}
    </div>
  )
}
