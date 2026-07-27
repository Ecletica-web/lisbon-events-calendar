'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

type PromoterRow = {
  promoter_id: string
  name: string
  slug: string
  instagram_handle?: string
  website_url?: string
  is_active: boolean
  primary_image_url?: string
}

export default function AdminPromotersPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [rows, setRows] = useState<PromoterRow[]>([])
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({
    promoter_id: '',
    name: '',
    instagram_handle: '',
    website_url: '',
    is_active: true,
  })

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/admin/promoters?all=1', { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || `Load failed (${res.status})`)
      setRows([])
      return
    }
    setRows(json.promoters || [])
    setMessage(null)
  }, [getAuthHeaders])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (!showInactive && !r.is_active) return false
      if (!needle) return true
      return (
        r.name.toLowerCase().includes(needle) ||
        r.promoter_id.toLowerCase().includes(needle) ||
        (r.instagram_handle || '').toLowerCase().includes(needle)
      )
    })
  }, [rows, q, showInactive])

  async function saveRow(row: Partial<PromoterRow> & { name: string }) {
    setBusy(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/promoters', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoter_id: row.promoter_id,
          name: row.name,
          instagram_handle: row.instagram_handle,
          website_url: row.website_url,
          is_active: row.is_active !== false,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error || 'Save failed')
        return
      }
      setMessage(`Saved ${json.promoter?.name || row.name}`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(row: PromoterRow) {
    setBusy(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/promoters', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoter_id: row.promoter_id, is_active: !row.is_active }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setMessage(json.error || 'Toggle failed')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Promoters catalog</h2>
          <p className="text-sm text-slate-400">
            Supabase SoT — scrape when handle + active.{' '}
            <Link href="/admin/venues" className="text-indigo-400 hover:underline">
              ← Venues
            </Link>
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600"
        >
          Refresh
        </button>
      </div>

      {message && <p className="text-sm text-amber-200">{message}</p>}

      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / id / handle"
          className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white w-64"
        />
        <label className="text-sm text-slate-300 flex items-center gap-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <span className="text-xs text-slate-500">{filtered.length} rows</span>
      </div>

      <div className="rounded border border-slate-700 bg-slate-800/60 p-3 space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">Add / upsert</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            placeholder="name *"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            placeholder="promoter_id (optional)"
            value={draft.promoter_id}
            onChange={(e) => setDraft((d) => ({ ...d, promoter_id: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            placeholder="instagram_handle"
            value={draft.instagram_handle}
            onChange={(e) => setDraft((d) => ({ ...d, instagram_handle: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white md:col-span-2"
            placeholder="website_url"
            value={draft.website_url}
            onChange={(e) => setDraft((d) => ({ ...d, website_url: e.target.value }))}
          />
        </div>
        <button
          type="button"
          disabled={busy || !draft.name.trim()}
          onClick={() =>
            void saveRow({
              promoter_id: draft.promoter_id || undefined,
              name: draft.name,
              instagram_handle: draft.instagram_handle,
              website_url: draft.website_url,
              is_active: draft.is_active,
            }).then(() =>
              setDraft({
                promoter_id: '',
                name: '',
                instagram_handle: '',
                website_url: '',
                is_active: true,
              })
            )
          }
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Save promoter
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">IG handle</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.promoter_id} className="border-t border-slate-700 text-slate-200">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleActive(r)}
                    className={`text-xs px-2 py-0.5 rounded ${
                      r.is_active
                        ? 'bg-emerald-900/60 text-emerald-200'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {r.is_active ? 'on' : 'off'}
                  </button>
                </td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.promoter_id}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.instagram_handle ? `@${r.instagram_handle}` : '—'}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-indigo-400 hover:underline"
                    onClick={() => void saveRow(r)}
                  >
                    Re-save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
