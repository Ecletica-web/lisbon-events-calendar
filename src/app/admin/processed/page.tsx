'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminSheetTable } from '@/components/admin/AdminSheetTable'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'
import { PROCESSED_EVENTS_COLUMNS } from '@/lib/pipelineSheetColumns'

export default function AdminProcessedPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [columns, setColumns] = useState<string[]>([...PROCESSED_EVENTS_COLUMNS])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [total, setTotal] = useState(0)
  const [sheetsUrl, setSheetsUrl] = useState<string | null>(null)
  const [canPublish, setCanPublish] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/admin/processed?limit=5000', { headers })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j.error || res.statusText)
      setColumns(Array.isArray(j.columns) ? j.columns : [...PROCESSED_EVENTS_COLUMNS])
      setRows([])
      setTotal(0)
      setCanPublish(false)
      return
    }
    setColumns(Array.isArray(j.columns) && j.columns.length ? j.columns : [...PROCESSED_EVENTS_COLUMNS])
    setRows(j.rows || [])
    setTotal(typeof j.total === 'number' ? j.total : (j.rows || []).length)
    setSheetsUrl(j.sheetsUrl || null)
    setCanPublish(Boolean(j.canPublish))
    setError(null)
  }, [getAuthHeaders])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const publish = useCallback(async () => {
    if (publishing) return
    setPublishing(true)
    setMessage(null)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/processed', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || res.statusText)
      setMessage(j.message || `Published ${j.published ?? 0} event(s)`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }, [getAuthHeaders, load, publishing])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) =>
      columns
        .map((c) => r[c] || '')
        .join(' ')
        .toLowerCase()
        .includes(needle)
    )
  }, [rows, q, columns])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <p className="text-sm text-slate-400">
          Staging sheet: <strong className="text-slate-200">Processed Events</strong>. Publish copies
          novel rows to <strong className="text-slate-200">Events Clean New</strong> (live calendar
          CSV).
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-indigo-400 hover:underline"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={!canPublish || publishing}
            title={
              canPublish
                ? 'Copy novel Processed rows → Events Clean New'
                : 'Configure GOOGLE_SHEETS_ID + service account on the server'
            }
            className="px-4 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {publishing ? 'Publishing…' : 'Publish to calendar'}
          </button>
          {sheetsUrl && (
            <a
              href={`${sheetsUrl}#gid=`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500"
            >
              Edit in Google Sheets
            </a>
          )}
        </div>
      </div>

      <input
        className="w-full max-w-md bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm"
        placeholder="Search any column…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {message && <p className="text-emerald-400 text-sm">{message}</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!canPublish && !error && (
        <p className="text-amber-400/90 text-sm">
          Publish needs Sheets write credentials on the server (GOOGLE_SHEETS_ID +
          GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON).
        </p>
      )}

      <AdminSheetTable
        columns={columns}
        rows={filtered}
        rowKey={(r, i) => r.event_id || String(i)}
      />
      <p className="text-xs text-slate-500">
        {filtered.length === rows.length
          ? `${total} row(s) in Processed Events · ${columns.length} columns`
          : `Showing ${filtered.length} of ${total} (search filter) · ${columns.length} columns`}
      </p>
    </div>
  )
}
