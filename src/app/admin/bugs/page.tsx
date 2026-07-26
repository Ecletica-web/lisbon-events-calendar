'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'
import type { BugReportListItem, BugReportStatus } from '@/lib/userBugReports'

const STATUSES: BugReportStatus[] = ['new', 'triaged', 'fixed', 'wontfix']

export default function AdminBugsPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [reports, setReports] = useState<BugReportListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | BugReportStatus>('all')
  const [selected, setSelected] = useState<BugReportListItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/bugs', { headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || res.statusText)
      setReports(Array.isArray(json.reports) ? json.reports : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    if (!isAdmin) return
    void load()
  }, [isAdmin, load])

  async function patchReport(id: string, patch: { status?: BugReportStatus; admin_notes?: string }) {
    setSavingId(id)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/bugs', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || res.statusText)
      const updated = json.report as BugReportListItem
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)))
      setSelected((prev) => (prev?.id === id ? { ...prev, ...updated } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingId(null)
    }
  }

  const filtered = reports.filter((r) => (filter === 'all' ? true : r.status === filter))
  const newCount = reports.filter((r) => r.status === 'new').length

  if (loading) return <p className="text-slate-400 text-sm">Loading feedback…</p>
  if (error && reports.length === 0) return <p className="text-red-400 text-sm">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-medium">User feedback</h2>
          <p className="text-sm text-slate-400 mt-1">
            {newCount} new · {reports.length} total — screenshots from the in-app Feedback button.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-amber-300 text-sm">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-md text-xs uppercase tracking-wide ${
              filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-slate-400 text-sm">No reports in this filter yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`w-full text-left rounded-lg border p-3 transition ${
                    selected?.id === r.id
                      ? 'border-indigo-500 bg-slate-800'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        r.status === 'new'
                          ? 'bg-amber-500/20 text-amber-200'
                          : r.status === 'fixed'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-slate-600/40 text-slate-300'
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-100 line-clamp-2">{r.description}</p>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">{r.page_url || '—'}</p>
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 min-h-[280px]">
            {!selected ? (
              <p className="text-slate-400 text-sm">Select a report to review.</p>
            ) : (
              <div className="space-y-4">
                {selected.screenshot_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={selected.screenshot_url} target="_blank" rel="noreferrer">
                    <img
                      src={selected.screenshot_url}
                      alt="Bug screenshot"
                      className="w-full max-h-64 object-contain object-top rounded border border-slate-600 bg-black"
                    />
                  </a>
                ) : (
                  <p className="text-slate-500 text-sm">No screenshot attached.</p>
                )}

                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-slate-100 whitespace-pre-wrap">{selected.description}</p>
                </div>

                <dl className="grid grid-cols-1 gap-2 text-xs text-slate-400">
                  <div>
                    <dt className="inline text-slate-500">Page: </dt>
                    <dd className="inline break-all text-slate-300">{selected.page_url || '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Viewport: </dt>
                    <dd className="inline text-slate-300">{selected.viewport || '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">User: </dt>
                    <dd className="inline text-slate-300">
                      {selected.user_email || selected.user_id || 'anonymous'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 mb-0.5">User agent</dt>
                    <dd className="text-slate-300 break-all">{selected.user_agent || '—'}</dd>
                  </div>
                </dl>

                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={selected.status}
                    disabled={savingId === selected.id}
                    onChange={(e) =>
                      void patchReport(selected.id, { status: e.target.value as BugReportStatus })
                    }
                    className="w-full rounded bg-slate-900 border border-slate-600 text-slate-100 text-sm px-3 py-2"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
                    Admin notes
                  </label>
                  <textarea
                    key={selected.id + selected.updated_at}
                    defaultValue={selected.admin_notes || ''}
                    rows={3}
                    className="w-full rounded bg-slate-900 border border-slate-600 text-slate-100 text-sm px-3 py-2"
                    onBlur={(e) => {
                      const next = e.target.value
                      if (next !== (selected.admin_notes || '')) {
                        void patchReport(selected.id, { admin_notes: next })
                      }
                    }}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Notes save when you leave the field.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
