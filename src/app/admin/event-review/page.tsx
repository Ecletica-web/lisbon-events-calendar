'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminSheetTable } from '@/components/admin/AdminSheetTable'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'
import { NEEDS_REVIEW_COLUMNS } from '@/lib/pipelineSheetColumns'

export default function AdminEventReviewPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [columns] = useState<string[]>([...NEEDS_REVIEW_COLUMNS])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [source, setSource] = useState<'supabase' | 'sheets'>('supabase')
  const [canWrite, setCanWrite] = useState(false)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, string> | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/admin/pipeline/review?status=${filter}`, { headers })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(j.error || 'Load failed')
      return
    }
    setRows(j.rows || [])
    setSource(j.source === 'sheets' ? 'sheets' : 'supabase')
    setCanWrite(!!j.canWrite)
    setMessage(
      j.source === 'sheets'
        ? 'Showing Needs_Review sheet (Supabase review queue empty). Approve/reject needs Supabase + Sheets write credentials.'
        : null
    )
  }, [getAuthHeaders, filter])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  async function resolve(reviewId: string, action: 'approved' | 'rejected') {
    if (source === 'sheets') {
      setMessage('Approve/reject only works on Supabase review queue items (run the pipeline worker).')
      return
    }
    setBusy(reviewId)
    setMessage(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/pipeline/review', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId,
          action,
          fieldEdits: Object.keys(edits).length ? edits : undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      setMessage(
        action === 'approved'
          ? j.processedAppended
            ? 'Approved and appended to Processed Events sheet'
            : 'Approved'
          : 'Rejected'
      )
      setSelected(null)
      setEdits({})
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Columns match the <strong className="text-slate-200">Needs_Review</strong> Google Sheet.
        {source === 'sheets' ? ' Sheet fallback.' : ' Supabase queue.'}
        {!canWrite && ' Processed append needs GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON.'}
      </p>

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

      <p className="text-xs text-slate-500">
        {rows.length} row(s) · {columns.length} columns
      </p>

      <AdminSheetTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => r.review_id || String(i)}
        onRowClick={(r) => {
          setSelected(r)
          setEdits({
            description_short: r.description_short || r.title || '',
            start_datetime: r.start_datetime || '',
            venue_name_raw: r.venue_name_raw || r.venue_name || '',
            description_long: r.description_long || '',
          })
        }}
      />

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-lg h-full overflow-y-auto bg-slate-900 border-l border-slate-700 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <h2 className="text-lg text-white font-medium">
                {selected.review_id || 'Review item'}
              </h2>
              <button type="button" className="text-slate-400" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            {(selected.stored_image_url || selected.thumbnail_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.stored_image_url || selected.thumbnail_url}
                alt=""
                className="w-full rounded"
              />
            )}
            {(['description_short', 'start_datetime', 'venue_name_raw', 'description_long'] as const).map(
              (field) => (
                <label key={field} className="block text-xs text-slate-400">
                  {field}
                  <input
                    className="mt-1 w-full bg-slate-950 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    value={edits[field] ?? ''}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [field]: e.target.value }))}
                    disabled={source === 'sheets'}
                  />
                </label>
              )
            )}
            {source === 'supabase' && (
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={busy === selected.review_id}
                  onClick={() => void resolve(selected.review_id, 'approved')}
                  className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
                >
                  Approve → Processed
                </button>
                <button
                  type="button"
                  disabled={busy === selected.review_id}
                  onClick={() => void resolve(selected.review_id, 'rejected')}
                  className="px-3 py-1.5 rounded bg-rose-700 text-white text-sm disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
