'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminSheetTable } from '@/components/admin/AdminSheetTable'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'
import { EVENTS_RAW_COLUMNS } from '@/lib/pipelineSheetColumns'

interface Extraction {
  id: string
  tier: string
  model: string | null
  parsed_json: unknown
  raw_model_text: string | null
  created_at: string
}

export default function AdminEventsRawPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [columns, setColumns] = useState<string[]>(['processing_status', ...EVENTS_RAW_COLUMNS])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState<'supabase' | 'sheets'>('supabase')
  const [q, setQ] = useState('')
  const [handle, setHandle] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [detail, setDetail] = useState<{
    post: Record<string, unknown>
    extractions: Extraction[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const limit = 40

  const load = useCallback(async () => {
    setLoading(true)
    const headers = await getAuthHeaders()
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (q) params.set('q', q)
    if (handle) params.set('handle', handle)
    if (status) params.set('status', status)
    try {
      const res = await fetch(`/api/admin/pipeline/posts?${params}`, { headers })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || res.statusText)
        setRows([])
        setTotal(0)
        return
      }
      if (Array.isArray(j.columns) && j.columns.length > 0) setColumns(j.columns)
      setRows(j.rows || [])
      setTotal(j.total || 0)
      setSource(j.source === 'sheets' ? 'sheets' : 'supabase')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders, q, handle, status, offset])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  async function openDetail(row: Record<string, string>) {
    if (source === 'sheets') {
      setDetail({ post: row, extractions: [] })
      return
    }
    const id = row.id
    if (!id) return
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/admin/pipeline/posts?id=${id}`, { headers })
    if (!res.ok) return
    setDetail(await res.json())
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Columns match the <strong className="text-slate-200">Events_Raw</strong> Google Sheet.
        {source === 'sheets'
          ? ' Showing sheet data (Supabase store empty — run scrape or backfill).'
          : ' Showing Supabase pipeline_posts.'}
      </p>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm text-slate-300">
          Search
          <input
            className="block mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="caption / shortcode"
          />
        </label>
        <label className="text-sm text-slate-300">
          Handle
          <input
            className="block mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-300">
          Status
          <select
            className="block mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white"
            value={status}
            onChange={(e) => {
              setOffset(0)
              setStatus(e.target.value)
            }}
            disabled={source === 'sheets'}
          >
            <option value="">all</option>
            <option value="new">new</option>
            <option value="discarded">discarded</option>
            <option value="needs_review">needs_review</option>
            <option value="processed">processed</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setOffset(0)
            void load()
          }}
          className="px-3 py-2 rounded bg-indigo-600 text-white text-sm"
        >
          Filter
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <p className="text-xs text-slate-500">
        {loading ? 'Loading…' : `Showing ${rows.length} of ${total}`} · {columns.length} columns
      </p>

      <AdminSheetTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => r.id || r.source_event_id || String(i)}
        onRowClick={(r) => void openDetail(r)}
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={offset === 0}
          className="px-3 py-1.5 rounded bg-slate-700 text-sm text-white disabled:opacity-40"
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Prev
        </button>
        <button
          type="button"
          disabled={offset + limit >= total}
          className="px-3 py-1.5 rounded bg-slate-700 text-sm text-white disabled:opacity-40"
          onClick={() => setOffset(offset + limit)}
        >
          Next
        </button>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-xl h-full overflow-y-auto bg-slate-900 border-l border-slate-700 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <h2 className="text-lg text-white font-medium">
                @{String(detail.post.owner_username || detail.post.ownerUsername || '')} /{' '}
                {String(detail.post.short_code || detail.post.shortCode || '')}
              </h2>
              <button type="button" className="text-slate-400" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
            {Boolean(
              detail.post.stored_image_url || detail.post.thumbnail_url || detail.post.displayUrl
            ) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={String(
                  detail.post.stored_image_url ||
                    detail.post.thumbnail_url ||
                    detail.post.displayUrl ||
                    ''
                )}
                alt=""
                className="w-full rounded"
              />
            )}
            <pre className="text-xs text-slate-400 whitespace-pre-wrap break-all bg-slate-950 p-3 rounded max-h-64 overflow-auto">
              {JSON.stringify(detail.post, null, 2)}
            </pre>
            {detail.extractions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm text-white">AI tiers</h3>
                {detail.extractions.map((ex) => (
                  <details key={ex.id} className="text-xs text-slate-400 border border-slate-700 rounded p-2">
                    <summary className="cursor-pointer text-slate-200">
                      {ex.tier} {ex.model ? `(${ex.model})` : ''}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                      {JSON.stringify(ex.parsed_json ?? ex.raw_model_text, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
