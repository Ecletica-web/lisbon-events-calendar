'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

export default function AdminProcessedPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
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
      return
    }
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
      [r.title, r.venue_name, r.source_name, r.start_datetime]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    )
  }, [rows, q])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <p className="text-sm text-slate-400">
          Read-only view of the <strong className="text-slate-200">Processed Events</strong> Google
          Sheet. Edit events directly in Sheets when venues request changes.
        </p>
        {sheetsUrl && (
          <a
            href={sheetsUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500"
          >
            Edit in Google Sheets
          </a>
        )}
      </div>

      <input
        className="w-full max-w-md bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm"
        placeholder="Search title / venue / handle…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="p-2">Title</th>
              <th className="p-2">Start</th>
              <th className="p-2">Venue</th>
              <th className="p-2">Source</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.event_id || i} className="border-t border-slate-800">
                <td className="p-2 text-slate-200 max-w-xs truncate">{r.title}</td>
                <td className="p-2 text-slate-400 text-xs whitespace-nowrap">{r.start_datetime}</td>
                <td className="p-2 text-slate-300">{r.venue_name || r.venue_name_raw}</td>
                <td className="p-2 text-slate-500">@{r.source_name}</td>
                <td className="p-2 text-slate-400">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{filtered.length} row(s)</p>
    </div>
  )
}
