'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

type VenueRow = {
  venue_id: string
  name: string
  slug: string
  instagram_handle?: string
  city?: string
  neighborhood?: string
  venue_address?: string
  is_active?: boolean
  primary_image_url?: string
}

export default function AdminVenuesPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [rows, setRows] = useState<VenueRow[]>([])
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({
    venue_id: '',
    name: '',
    instagram_handle: '',
    city: '',
    neighborhood: '',
    address: '',
    is_active: true,
  })

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/admin/venues?all=1', { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || `Load failed (${res.status})`)
      setRows([])
      return
    }
    setRows(json.venues || [])
    setMessage(null)
  }, [getAuthHeaders])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (!showInactive && r.is_active === false) return false
      if (!needle) return true
      return (
        r.name.toLowerCase().includes(needle) ||
        r.venue_id.toLowerCase().includes(needle) ||
        (r.instagram_handle || '').toLowerCase().includes(needle)
      )
    })
  }, [rows, q, showInactive])

  async function saveRow(row: Partial<VenueRow> & { name: string }) {
    setBusy(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/venues', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: row.venue_id,
          name: row.name,
          instagram_handle: row.instagram_handle,
          city: row.city,
          neighborhood: row.neighborhood,
          address: row.venue_address,
          is_active: row.is_active !== false,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error || 'Save failed')
        return
      }
      setMessage(`Saved ${json.venue?.name || row.name}`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(row: VenueRow) {
    setBusy(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/venues', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: row.venue_id, is_active: !(row.is_active !== false) }),
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
          <h2 className="text-lg font-semibold text-white">Venues catalog</h2>
          <p className="text-sm text-slate-400">
            Supabase SoT — scrape when <code className="text-slate-300">instagram_handle</code> +{' '}
            <code className="text-slate-300">is_active</code>.{' '}
            <Link href="/admin/promoters" className="text-indigo-400 hover:underline">
              Promoters →
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
            placeholder="venue_id (optional)"
            value={draft.venue_id}
            onChange={(e) => setDraft((d) => ({ ...d, venue_id: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            placeholder="instagram_handle"
            value={draft.instagram_handle}
            onChange={(e) => setDraft((d) => ({ ...d, instagram_handle: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            placeholder="city"
            value={draft.city}
            onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            placeholder="neighborhood"
            value={draft.neighborhood}
            onChange={(e) => setDraft((d) => ({ ...d, neighborhood: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            placeholder="address"
            value={draft.address}
            onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
          />
        </div>
        <button
          type="button"
          disabled={busy || !draft.name.trim()}
          onClick={() =>
            void saveRow({
              venue_id: draft.venue_id || undefined,
              name: draft.name,
              instagram_handle: draft.instagram_handle,
              city: draft.city,
              neighborhood: draft.neighborhood,
              venue_address: draft.address,
              is_active: draft.is_active,
            }).then(() =>
              setDraft({
                venue_id: '',
                name: '',
                instagram_handle: '',
                city: '',
                neighborhood: '',
                address: '',
                is_active: true,
              })
            )
          }
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Save venue
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
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.venue_id} className="border-t border-slate-700 text-slate-200">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleActive(r)}
                    className={`text-xs px-2 py-0.5 rounded ${
                      r.is_active !== false
                        ? 'bg-emerald-900/60 text-emerald-200'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {r.is_active !== false ? 'on' : 'off'}
                  </button>
                </td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.venue_id}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.instagram_handle ? `@${r.instagram_handle}` : '—'}
                </td>
                <td className="px-3 py-2 text-slate-400">{r.city || '—'}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-indigo-400 hover:underline"
                    onClick={() =>
                      void saveRow({
                        ...r,
                        name: r.name,
                        is_active: r.is_active !== false,
                      })
                    }
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
