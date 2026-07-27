'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

type Candidate = {
  id: string
  kind: 'venue' | 'promoter'
  status: string
  proposed_name: string
  proposed_handle: string | null
  suggested_city: string | null
  evidence_summary: string | null
  sample_source_url: string | null
  sample_caption: string | null
  sample_owner_username: string | null
  sighting_count: number
  last_seen_at: string
  resolved_entity_id: string | null
}

type Draft = {
  kind: 'venue' | 'promoter'
  name: string
  instagram_handle: string
  city: string
  aliases: string
  notes: string
}

function draftFrom(c: Candidate): Draft {
  return {
    kind: c.kind,
    name: c.proposed_name,
    instagram_handle: c.proposed_handle || '',
    city: c.suggested_city || '',
    aliases: '',
    notes: '',
  }
}

export default function AdminCatalogCandidatesPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [rows, setRows] = useState<Candidate[]>([])
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [kindFilter, setKindFilter] = useState<'all' | 'venue' | 'promoter'>('all')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(
      `/api/admin/catalog-candidates?status=${filter}&kind=${kindFilter}`,
      { headers }
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || `Load failed (${res.status})`)
      setRows([])
      return
    }
    const list = (json.candidates || []) as Candidate[]
    setRows(list)
    setDrafts((prev) => {
      const next = { ...prev }
      for (const c of list) {
        if (!next[c.id]) next[c.id] = draftFrom(c)
      }
      return next
    })
    setMessage(null)
  }, [getAuthHeaders, filter, kindFilter])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  async function act(id: string, action: 'approve' | 'reject') {
    const d = drafts[id]
    if (action === 'approve' && !d?.name.trim()) {
      setMessage('Name required to approve')
      return
    }
    setBusy(id)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/catalog-candidates', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'reject'
            ? { action, id, notes: d?.notes }
            : {
                action,
                id,
                kind: d.kind,
                name: d.name,
                instagram_handle: d.instagram_handle || undefined,
                city: d.city || undefined,
                aliases: d.aliases || undefined,
                notes: d.notes || undefined,
              }
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error || 'Action failed')
        return
      }
      setMessage(
        action === 'approve'
          ? `Approved → ${json.entityId}. Re-run extract or re-resolve-review-queue to attach pending events.`
          : 'Rejected'
      )
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-white">Catalog candidates</h2>
        <p className="text-sm text-slate-400 mt-1">
          Venues the pipeline could not resolve, and unknown @mentions proposed as promoters.
          Approve writes to the Supabase catalog (and scrape watchlist). Separate from{' '}
          <Link href="/admin/event-review" className="text-indigo-400 hover:underline">
            event review
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded text-sm ${
              filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="text-slate-600 mx-1">|</span>
        {(['all', 'venue', 'promoter'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKindFilter(k)}
            className={`px-3 py-1.5 rounded text-sm ${
              kindFilter === k ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto px-3 py-1.5 rounded text-sm bg-slate-800 text-slate-300 hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {message && <p className="text-sm text-amber-200/90">{message}</p>}

      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm">No candidates for this filter.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((c) => {
            const d = drafts[c.id] || draftFrom(c)
            const pending = c.status === 'pending'
            return (
              <li
                key={c.id}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3"
              >
                <div className="flex flex-wrap gap-3 items-baseline justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-indigo-300">
                      {c.kind}
                    </span>
                    <span className="ml-2 text-white font-medium">{c.proposed_name}</span>
                    {c.proposed_handle && (
                      <span className="ml-2 text-slate-400 text-sm">@{c.proposed_handle}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {c.sighting_count}× · last {new Date(c.last_seen_at).toLocaleString()}
                    {c.resolved_entity_id && (
                      <span className="ml-2 text-emerald-400">→ {c.resolved_entity_id}</span>
                    )}
                  </div>
                </div>

                {c.evidence_summary && (
                  <p className="text-xs text-slate-400">{c.evidence_summary}</p>
                )}
                {c.sample_owner_username && (
                  <p className="text-xs text-slate-500">
                    Seen on @{c.sample_owner_username}
                    {c.sample_source_url && (
                      <>
                        {' · '}
                        <a
                          href={c.sample_source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:underline"
                        >
                          post
                        </a>
                      </>
                    )}
                  </p>
                )}
                {c.sample_caption && (
                  <p className="text-xs text-slate-500 line-clamp-3 whitespace-pre-wrap">
                    {c.sample_caption.slice(0, 400)}
                  </p>
                )}

                {pending && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-slate-400">
                      Kind
                      <select
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                        value={d.kind}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [c.id]: {
                              ...d,
                              kind: e.target.value as 'venue' | 'promoter',
                            },
                          }))
                        }
                      >
                        <option value="venue">venue</option>
                        <option value="promoter">promoter</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-400">
                      Name
                      <input
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                        value={d.name}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [c.id]: { ...d, name: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Instagram handle
                      <input
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                        value={d.instagram_handle}
                        placeholder="optional"
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [c.id]: { ...d, instagram_handle: e.target.value },
                          }))
                        }
                      />
                    </label>
                    {d.kind === 'venue' && (
                      <label className="text-xs text-slate-400">
                        City
                        <input
                          className="mt-1 w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                          value={d.city}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [c.id]: { ...d, city: e.target.value },
                            }))
                          }
                        />
                      </label>
                    )}
                    <label className="text-xs text-slate-400 sm:col-span-2">
                      Aliases (pipe-separated)
                      <input
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                        value={d.aliases}
                        placeholder="alias1|alias2"
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [c.id]: { ...d, aliases: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                )}

                {pending && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => void act(c.id, 'approve')}
                      className="px-3 py-1.5 rounded bg-emerald-700 text-white text-sm hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Approve &amp; add to catalog
                    </button>
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => void act(c.id, 'reject')}
                      className="px-3 py-1.5 rounded bg-slate-700 text-slate-200 text-sm hover:bg-slate-600 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
