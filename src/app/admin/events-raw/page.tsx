'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

interface PostRow {
  id: string
  owner_username: string | null
  short_code: string | null
  caption: string | null
  media_type: string | null
  processing_status: string
  posted_at: string | null
  stored_image_url: string | null
  thumbnail_url: string | null
  like_count: string | null
  source_url: string | null
}

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
  const [rows, setRows] = useState<PostRow[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [handle, setHandle] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [detail, setDetail] = useState<{
    post: PostRow & Record<string, unknown>
    extractions: Extraction[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const limit = 40

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (q) params.set('q', q)
    if (handle) params.set('handle', handle)
    if (status) params.set('status', status)
    const res = await fetch(`/api/admin/pipeline/posts?${params}`, { headers })
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || res.statusText)
      return
    }
    const j = await res.json()
    setRows(j.rows || [])
    setTotal(j.total || 0)
    setError(null)
  }, [getAuthHeaders, q, handle, status, offset])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  async function openDetail(id: string) {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/admin/pipeline/posts?id=${id}`, { headers })
    if (!res.ok) return
    setDetail(await res.json())
  }

  return (
    <div className="space-y-4">
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
        Showing {rows.length} of {total}
      </p>

      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="p-2">Image</th>
              <th className="p-2">Handle</th>
              <th className="p-2">Media</th>
              <th className="p-2">Status</th>
              <th className="p-2">Posted</th>
              <th className="p-2">Caption</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-slate-800 hover:bg-slate-800/60 cursor-pointer"
                onClick={() => void openDetail(r.id)}
              >
                <td className="p-2">
                  {(r.stored_image_url || r.thumbnail_url) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.stored_image_url || r.thumbnail_url || ''}
                      alt=""
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
                </td>
                <td className="p-2 text-slate-200">@{r.owner_username}</td>
                <td className="p-2 text-slate-400">{r.media_type}</td>
                <td className="p-2 text-slate-300">{r.processing_status}</td>
                <td className="p-2 text-slate-500 text-xs">
                  {r.posted_at ? new Date(r.posted_at).toLocaleDateString() : '—'}
                </td>
                <td className="p-2 text-slate-400 max-w-xs truncate">{r.caption}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                @{String(detail.post.owner_username)} / {String(detail.post.short_code)}
              </h2>
              <button type="button" className="text-slate-400" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
            {(detail.post.stored_image_url || detail.post.thumbnail_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={String(detail.post.stored_image_url || detail.post.thumbnail_url)}
                alt=""
                className="w-full max-h-64 object-contain rounded bg-black"
              />
            )}
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{String(detail.post.caption || '')}</p>
            <p className="text-xs text-slate-500">
              status={detail.post.processing_status} · likes={String(detail.post.like_count || '')}{' '}
              {detail.post.source_url && (
                <a
                  href={String(detail.post.source_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400"
                >
                  Open post
                </a>
              )}
            </p>

            <h3 className="text-white font-medium pt-2">AI tiers</h3>
            {detail.extractions.length === 0 && (
              <p className="text-slate-500 text-sm">No extraction artifacts yet.</p>
            )}
            {detail.extractions.map((ex) => (
              <details key={ex.id} className="rounded border border-slate-700 p-3">
                <summary className="cursor-pointer text-sm text-indigo-300">
                  {ex.tier} {ex.model ? `(${ex.model})` : ''}
                </summary>
                {ex.parsed_json != null && (
                  <pre className="mt-2 text-xs text-slate-400 overflow-auto max-h-48">
                    {JSON.stringify(ex.parsed_json, null, 2)}
                  </pre>
                )}
                {ex.raw_model_text && (
                  <pre className="mt-2 text-xs text-slate-500 overflow-auto max-h-40 whitespace-pre-wrap">
                    {ex.raw_model_text.slice(0, 8000)}
                  </pre>
                )}
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
