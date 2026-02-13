'use client'

import { useEffect, useState } from 'react'

export default function EventLikeCount({ eventId }: { eventId: string }) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!eventId) return
    fetch(`/api/events/${encodeURIComponent(eventId)}/likes`)
      .then((r) => r.json())
      .then((d) => setCount(typeof d.count === 'number' ? d.count : 0))
      .catch(() => setCount(0))
  }, [eventId])

  if (count === null || count === 0) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
      {count} like{count !== 1 ? 's' : ''}
    </span>
  )
}
