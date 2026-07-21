'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminSheetTable } from '@/components/admin/AdminSheetTable'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'
import { PROCESSED_EVENTS_COLUMNS } from '@/lib/pipelineSheetColumns'

export default function AdminProcessedPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [columns, setColumns] = useState<string[]>([...PROCESSED_EVENTS_COLUMNS])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [sheetsUrl, setSheetsUrl] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/admin/processed?limit=150', { headers })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j.error || res.statusText)
      setColumns(Array.isArray(j.columns) ? j.columns : [...PROCESSED_EVENTS_COLUMNS])
      setRows([])
      return
    }
    setColumns(Array.isArray(j.columns) && j.columns.length ? j.columns : [...PROCESSED_EVENTS_COLUMNS])
    setRows(j.rows || [])
    setSheetsUrl(j.sheetsUrl || null)
    setError(null)
  }, [getAuthHeaders])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

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
          Read-only view of the <strong className="text-slate-200">Processed Events</strong> Google
          Sheet (same columns as Sheets). Edit events directly in Sheets when venues request
          changes.
        </p>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-indigo-400 hover:underline"
          >
            Refresh
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

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <AdminSheetTable
        columns={columns}
        rows={filtered}
        rowKey={(r, i) => r.event_id || String(i)}
      />
      <p className="text-xs text-slate-500">
        {filtered.length} row(s) · {columns.length} columns
      </p>
    </div>
  )
}
