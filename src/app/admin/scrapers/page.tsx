'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

interface WatchlistRow {
  handle: string
  type: string
  active: boolean
  notes: string
}

interface PipelineRun {
  id: string
  mode: string
  status: string
  params: Record<string, unknown>
  stats: Record<string, unknown>
  apify_run_id: string | null
  requested_by: string | null
  log: string
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export default function AdminScrapersPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([])
  const [sheetsUrl, setSheetsUrl] = useState<string | null>(null)
  const [canWriteSheets, setCanWriteSheets] = useState(false)
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [configText, setConfigText] = useState('{}')
  const [workerHb, setWorkerHb] = useState<string | null>(null)
  const [mode, setMode] = useState<'scrape' | 'extract' | 'verify' | 'full'>('full')
  const [handle, setHandle] = useState('')
  const [limit, setLimit] = useState('')
  const [postMaxAgeDays, setPostMaxAgeDays] = useState('14')
  const [forceVision, setForceVision] = useState(false)
  const [syncVenueImages, setSyncVenueImages] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const [wl, runsRes, cfg, hub] = await Promise.all([
      fetch('/api/admin/watchlist', { headers }),
      fetch('/api/admin/pipeline/runs', { headers }),
      fetch('/api/admin/pipeline/config', { headers }),
      fetch('/api/admin/hub', { headers }),
    ])
    const wlJson = await wl.json().catch(() => ({}))
    setWatchlist(Array.isArray(wlJson.rows) ? wlJson.rows : [])
    setSheetsUrl(wlJson.sheetsUrl || null)
    setCanWriteSheets(!!wlJson.canWrite)
    if (!wl.ok) {
      setMessage(wlJson.error || `Fontes IG load failed (HTTP ${wl.status})`)
    } else if (wlJson.canWrite === false) {
      setMessage(
        'Fontes IG is read-only here (no Sheets service account). Edit sources in Google Sheets; scrapes still read the public CSV.'
      )
    } else {
      setMessage(null)
    }
    if (runsRes.ok) setRuns((await runsRes.json()).runs || [])
    if (cfg.ok) {
      const j = await cfg.json()
      setConfigText(JSON.stringify(j.config?.config_json ?? {}, null, 2))
      setWorkerHb(j.config?.worker_heartbeat_at ?? null)
    }
    if (hub.ok) {
      const j = await hub.json()
      setWorkerHb(j.workerHeartbeatAt)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  async function saveWatchlist() {
    setBusy(true)
    setMessage(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/watchlist', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: watchlist }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Save failed')
      setWatchlist(j.rows || [])
      setMessage('Fontes IG saved to Google Sheets')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function saveConfig() {
    setBusy(true)
    setMessage(null)
    try {
      const parsed = JSON.parse(configText)
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/pipeline/config', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_json: parsed }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Save failed')
      setMessage('Config saved')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Invalid JSON')
    } finally {
      setBusy(false)
    }
  }

  async function enqueueRun() {
    setBusy(true)
    setMessage(null)
    try {
      const headers = await getAuthHeaders()
      const body: Record<string, unknown> = { mode, forceVision, syncVenueImages }
      if (handle.trim()) body.handle = handle.trim()
      if (limit.trim()) body.limit = Number(limit)
      if (postMaxAgeDays.trim()) body.postMaxAgeDays = Number(postMaxAgeDays)
      const res = await fetch('/api/admin/pipeline/runs', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Enqueue failed')
      setMessage(`Queued ${mode} run ${j.run?.id}`)
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function abortRun(runId: string) {
    const headers = await getAuthHeaders()
    await fetch('/api/admin/pipeline/runs', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'abort', runId }),
    })
    await load()
  }

  return (
    <div className="space-y-8">
      {message && (
        <p className="text-sm text-indigo-300 bg-indigo-950/40 border border-indigo-800 rounded px-3 py-2">
          {message}
        </p>
      )}

      <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-medium text-white">Run scrapers</h2>
          <span className="text-xs text-slate-400">
            Worker heartbeat:{' '}
            {workerHb ? new Date(workerHb).toLocaleString() : 'never — run npm run worker'}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          <span className="text-slate-300">full</span> = scrape → extract → Tier 5 verify. High-confidence
          events go straight to Processed; only soft fails / disputed verifies land in Event Review.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm text-slate-300">
            Mode
            <select
              className="block mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="full">full (through Tier 5)</option>
              <option value="scrape">scrape</option>
              <option value="extract">extract (+ Tier 5)</option>
              <option value="verify">verify (Tier 5 only)</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Handle (optional)
            <input
              className="block mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="luxfragil"
            />
          </label>
          <label className="text-sm text-slate-300">
            Limit
            <input
              className="block mt-1 w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="10"
            />
          </label>
          <label className="text-sm text-slate-300">
            Max age (days)
            <input
              className="block mt-1 w-28 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white"
              value={postMaxAgeDays}
              onChange={(e) => setPostMaxAgeDays(e.target.value)}
              placeholder="14"
              inputMode="numeric"
              title="Only scrape posts newer than this many days (also respects last successful scrape)"
            />
          </label>
          <label className="text-sm text-slate-300 flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={forceVision}
              onChange={(e) => setForceVision(e.target.checked)}
            />
            Force vision
          </label>
          <label className="text-sm text-slate-300 flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={syncVenueImages}
              onChange={(e) => setSyncVenueImages(e.target.checked)}
            />
            Sync venue profile pics
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void enqueueRun()}
            className="px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            Queue run
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded bg-slate-700 text-slate-200 text-sm"
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-medium text-white">
            Fontes IG (Google Sheets)
            {watchlist.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                {watchlist.length} sources
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            {sheetsUrl && (
              <a
                href={sheetsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-indigo-400 hover:underline"
              >
                Open Sheet
              </a>
            )}
            <button
              type="button"
              disabled={busy || !canWriteSheets}
              title={
                canWriteSheets
                  ? undefined
                  : 'Needs GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON'
              }
              onClick={() => void saveWatchlist()}
              className="px-3 py-1.5 rounded bg-emerald-700 text-white text-sm disabled:opacity-50"
            >
              Save list
            </button>
            <button
              type="button"
              onClick={() =>
                setWatchlist((w) => [...w, { handle: '', type: 'venue', active: true, notes: '' }])
              }
              className="px-3 py-1.5 rounded bg-slate-700 text-white text-sm"
            >
              + Row
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-slate-400 border-b border-slate-700">
              <tr>
                <th className="py-2 pr-2">Handle</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Active</th>
                <th className="py-2 pr-2">Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {watchlist.map((row, i) => (
                <tr key={i} className="border-b border-slate-800">
                  <td className="py-1.5 pr-2">
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                      value={row.handle}
                      onChange={(e) =>
                        setWatchlist((w) =>
                          w.map((r, j) => (j === i ? { ...r, handle: e.target.value } : r))
                        )
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                      value={row.type}
                      onChange={(e) =>
                        setWatchlist((w) =>
                          w.map((r, j) => (j === i ? { ...r, type: e.target.value } : r))
                        )
                      }
                    >
                      <option value="venue">venue</option>
                      <option value="promoter">promoter</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) =>
                        setWatchlist((w) =>
                          w.map((r, j) => (j === i ? { ...r, active: e.target.checked } : r))
                        )
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                      value={row.notes}
                      onChange={(e) =>
                        setWatchlist((w) =>
                          w.map((r, j) => (j === i ? { ...r, notes: e.target.value } : r))
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-red-400 text-xs"
                      onClick={() => setWatchlist((w) => w.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Scraper config (JSON)</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveConfig()}
            className="px-3 py-1.5 rounded bg-emerald-700 text-white text-sm"
          >
            Save config
          </button>
        </div>
        <textarea
          className="w-full h-48 font-mono text-xs bg-slate-950 border border-slate-700 rounded p-3 text-slate-200"
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
        />
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
        <h2 className="text-lg font-medium text-white">Run history</h2>
        <div className="space-y-2">
          {runs.length === 0 && <p className="text-slate-500 text-sm">No runs yet.</p>}
          {runs.map((run) => (
            <div key={run.id} className="rounded border border-slate-700 bg-slate-900/50 p-3 text-sm">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="text-slate-200">
                  <span className="font-mono text-xs text-slate-500">{run.id.slice(0, 8)}</span>{' '}
                  <strong>{run.mode}</strong>{' '}
                  <span
                    className={
                      run.status === 'success'
                        ? 'text-emerald-400'
                        : run.status === 'error'
                          ? 'text-red-400'
                          : 'text-amber-300'
                    }
                  >
                    {run.status}
                  </span>
                  {run.requested_by && (
                    <span className="text-slate-500 ml-2">by {run.requested_by}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {(run.status === 'queued' || run.status === 'running') && (
                    <button
                      type="button"
                      className="text-xs text-red-400"
                      onClick={() => void abortRun(run.id)}
                    >
                      Abort
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-indigo-400"
                    onClick={() => setLogOpen(logOpen === run.id ? null : run.id)}
                  >
                    {logOpen === run.id ? 'Hide log' : 'Log'}
                  </button>
                  {run.apify_run_id && (
                    <a
                      className="text-xs text-indigo-400"
                      href={`https://console.apify.com/actors/runs/${run.apify_run_id.split('|')[0]}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Apify
                    </a>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {new Date(run.created_at).toLocaleString()}
                {run.stats && Object.keys(run.stats).length > 0 && (
                  <span className="ml-2">{JSON.stringify(run.stats)}</span>
                )}
              </div>
              {logOpen === run.id && (
                <pre className="mt-2 max-h-48 overflow-auto text-xs text-slate-400 whitespace-pre-wrap">
                  {run.log || '(empty)'}
                </pre>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
