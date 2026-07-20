'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

interface ReviewRow {
  review_id: string
  description_short: string | null
  description_long: string | null
  start_datetime: string | null
  venue_name_raw: string | null
  validation_status: string | null
  validation_reasons: string | null
  verification_verdict: string | null
  verification_notes: string | null
  verification_sources: string | null
  suggested_corrections: string | null
  stored_image_url: string | null
  thumbnail_url: string | null
  owner_username: string | null
  source_url: string | null
  caption: string | null
  review_status: string
  confidence_score: string | null
}

export default function AdminEventReviewPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/admin/pipeline/review?status=${filter}`, { headers })
    if (!res.ok) {
      setMessage((await res.json().catch(() => ({}))).error || 'Load failed')
      return
    }
    setRows((await res.json()).rows || [])
    setMessage(null)
  }, [getAuthHeaders, filter])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  function editFor(id: string) {
    return edits[id] || {}
  }

  function setEdit(id: string, field: string, value: string) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }))
  }

  async function resolve(reviewId: string, action: 'approved' | 'rejected') {
    setBusy(reviewId)
    setMessage(null)
    try {
      const headers = await getAuthHeaders()
      const fieldEdits = editFor(reviewId)
      const res = await fetch('/api/admin/pipeline/review', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId,
          action,
          fieldEdits: Object.keys(fieldEdits).length ? fieldEdits : undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')

      // Optional quality feedback
      await fetch('/api/admin/event-review/feedback', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: reviewId,
          dataset: 'needsReview',
          quality_rating: action === 'approved' ? 8 : 3,
          notes: action === 'approved' ? 'Approved from admin' : 'Rejected from admin',
          field_corrections: fieldEdits,
        }),
      }).catch(() => null)

      setMessage(
        action === 'approved'
          ? j.processedAppended
            ? 'Approved and appended to Processed Events sheet'
            : 'Approved'
          : 'Rejected'
      )
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  function applySuggestions(row: ReviewRow) {
    if (!row.suggested_corrections) return
    try {
      const s = JSON.parse(row.suggested_corrections) as Record<string, string>
      const next: Record<string, string> = {}
      if (s.title) next.description_short = s.title
      if (s.start_datetime) next.start_datetime = s.start_datetime
      if (s.venue_name || s.venue) next.venue_name_raw = s.venue_name || s.venue
      setEdits((e) => ({ ...e, [row.review_id]: { ...e[row.review_id], ...next } }))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-sm ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} className="text-sm text-indigo-400">
          Refresh
        </button>
      </div>

      {message && (
        <p className="text-sm text-indigo-300 bg-indigo-950/40 border border-indigo-800 rounded px-3 py-2">
          {message}
        </p>
      )}

      {rows.length === 0 && <p className="text-slate-500 text-sm">No items.</p>}

      <div className="space-y-4">
        {rows.map((row) => {
          const e = editFor(row.review_id)
          return (
            <article
              key={row.review_id}
              className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 grid gap-4 md:grid-cols-[140px_1fr]"
            >
              <div>
                {(row.stored_image_url || row.thumbnail_url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.stored_image_url || row.thumbnail_url || ''}
                    alt=""
                    className="w-full rounded object-cover aspect-square"
                  />
                )}
                <p className="text-xs text-slate-500 mt-2">@{row.owner_username}</p>
                {row.source_url && (
                  <a
                    href={row.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400"
                  >
                    Source
                  </a>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    {row.review_status}
                  </span>
                  {row.validation_status && (
                    <span className="px-2 py-0.5 rounded bg-amber-900/50 text-amber-200">
                      {row.validation_status}: {row.validation_reasons}
                    </span>
                  )}
                  {row.verification_verdict && (
                    <span className="px-2 py-0.5 rounded bg-violet-900/50 text-violet-200">
                      Tier5: {row.verification_verdict}
                    </span>
                  )}
                </div>

                {row.verification_notes && (
                  <p className="text-xs text-slate-400">{row.verification_notes}</p>
                )}
                {row.suggested_corrections && (
                  <div className="text-xs">
                    <button
                      type="button"
                      className="text-indigo-400 underline"
                      onClick={() => applySuggestions(row)}
                    >
                      Apply Tier 5 suggestions
                    </button>
                    <pre className="mt-1 text-slate-500 overflow-auto max-h-20">
                      {row.suggested_corrections}
                    </pre>
                  </div>
                )}

                <label className="block text-xs text-slate-400">
                  Title
                  <input
                    className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    value={e.description_short ?? row.description_short ?? ''}
                    onChange={(ev) => setEdit(row.review_id, 'description_short', ev.target.value)}
                    disabled={row.review_status !== 'pending'}
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Start datetime
                  <input
                    className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    value={e.start_datetime ?? row.start_datetime ?? ''}
                    onChange={(ev) => setEdit(row.review_id, 'start_datetime', ev.target.value)}
                    disabled={row.review_status !== 'pending'}
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Venue
                  <input
                    className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    value={e.venue_name_raw ?? row.venue_name_raw ?? ''}
                    onChange={(ev) => setEdit(row.review_id, 'venue_name_raw', ev.target.value)}
                    disabled={row.review_status !== 'pending'}
                  />
                </label>

                {row.review_status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={busy === row.review_id}
                      onClick={() => void resolve(row.review_id, 'approved')}
                      className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
                    >
                      Approve → Processed
                    </button>
                    <button
                      type="button"
                      disabled={busy === row.review_id}
                      onClick={() => void resolve(row.review_id, 'rejected')}
                      className="px-3 py-1.5 rounded bg-red-700 text-white text-sm disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
