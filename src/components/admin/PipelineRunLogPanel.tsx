'use client'

export interface PipelineRunForLog {
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

type StageId = 'queued' | 'venue-images' | 'scrape' | 'extract' | 'verify' | 'done'
type StageState = 'pending' | 'running' | 'done' | 'error' | 'skipped'

interface StageInfo {
  id: StageId
  label: string
  state: StageState
  detail?: string
}

const STAGE_ORDER: StageId[] = ['queued', 'venue-images', 'scrape', 'extract', 'verify', 'done']

function expectedStages(mode: string, syncVenueImages: boolean): StageId[] {
  const stages: StageId[] = ['queued']
  if (mode === 'scrape' || mode === 'full') {
    if (syncVenueImages) stages.push('venue-images')
    stages.push('scrape')
  }
  if (mode === 'extract' || mode === 'full') {
    stages.push('extract')
    stages.push('verify') // Tier 5 runs inside extract unless --skip-verify
  }
  if (mode === 'verify') stages.push('verify')
  stages.push('done')
  return stages
}

function lastErrorLine(log: string): string | undefined {
  const lines = log.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (
      /Worker error:|FAILED:|\[scrape\] failed:|STAGE:.*\(error/i.test(line) ||
      (/error/i.test(line) && !/0 error/i.test(line) && !/no error/i.test(line))
    ) {
      return line.replace(/^\[[^\]]+\]\s*/, '').trim()
    }
  }
  return undefined
}

function stageMarkers(log: string, stage: Exclude<StageId, 'queued' | 'done'>): {
  started: boolean
  done: boolean
  errored: boolean
} {
  const startRe = new RegExp(`=== STAGE: ${stage} \\(start\\) ===`, 'i')
  const doneRe = new RegExp(`=== STAGE: ${stage} \\(done\\) ===`, 'i')
  const errRe = new RegExp(`=== STAGE: ${stage} \\(error`, 'i')
  // Fallback for older logs without STAGE banners
  const legacyStart =
    stage === 'venue-images'
      ? /\[venue-images\] fetching/i.test(log)
      : stage === 'scrape'
        ? /\[scrape\] \d+ handle/i.test(log)
        : stage === 'extract'
          ? /\[extract\] /i.test(log)
          : /\[verify\] /i.test(log)
  const legacyFail =
    stage === 'scrape'
      ? /\[scrape\] failed:/i.test(log)
      : stage === 'extract'
        ? /\[extract\].*error/i.test(log)
        : stage === 'verify'
          ? /\[verify\].*error/i.test(log)
          : /\[venue-images\].*failed/i.test(log)
  const legacyDone =
    stage === 'venue-images'
      ? /\[venue-images\] (Apify returned|Venues sheet|no active)/i.test(log)
      : stage === 'scrape'
        ? /\[scrape\] wrote /i.test(log)
        : stage === 'extract'
          ? /\[extract\] done:/i.test(log)
          : /\[verify\] done:/i.test(log)

  return {
    started: startRe.test(log) || legacyStart,
    done: doneRe.test(log) || legacyDone,
    errored: errRe.test(log) || legacyFail,
  }
}

export function deriveRunStages(run: PipelineRunForLog): {
  stages: StageInfo[]
  brokeAt: string | null
  summary: string
} {
  const syncVenue =
    run.params?.syncVenueImages !== false && run.params?.sync_venue_images !== false
  const expected = expectedStages(run.mode, syncVenue !== false)
  const log = run.log || ''
  const runFailed = run.status === 'error' || run.status === 'aborted'
  const runActive = run.status === 'queued' || run.status === 'running'
  const err = lastErrorLine(log)

  const stages: StageInfo[] = STAGE_ORDER.filter((id) => expected.includes(id)).map((id) => {
    if (id === 'queued') {
      if (run.status === 'queued') return { id, label: 'Queued', state: 'running' as StageState }
      return { id, label: 'Queued', state: 'done' as StageState }
    }
    if (id === 'done') {
      if (run.status === 'success') return { id, label: 'Finished', state: 'done' as StageState }
      if (runFailed) {
        return {
          id,
          label: 'Finished',
          state: 'error' as StageState,
          detail: err,
        }
      }
      return { id, label: 'Finished', state: 'pending' as StageState }
    }

    const m = stageMarkers(log, id)
    let state: StageState = 'pending'
    if (m.errored) state = 'error'
    else if (m.done) state = 'done'
    else if (m.started) state = runActive ? 'running' : runFailed ? 'error' : 'running'
    else if (runFailed && !m.started) state = 'skipped'

    const label =
      id === 'venue-images'
        ? 'Venue images'
        : id === 'scrape'
          ? 'Scrape posts'
          : id === 'extract'
            ? 'Extract (AI)'
            : 'Verify (Tier 5)'

    return {
      id,
      label,
      state,
      detail: state === 'error' ? err : undefined,
    }
  })

  const broke = stages.find((s) => s.state === 'error')
  const brokeAt = broke ? broke.label : null

  let summary = ''
  if (run.status === 'queued') summary = 'Waiting for worker…'
  else if (run.status === 'running') {
    const current = [...stages].reverse().find((s) => s.state === 'running') || stages.find((s) => s.state === 'pending')
    summary = current ? `Running: ${current.label}` : 'Running…'
  } else if (run.status === 'success') summary = 'Completed successfully'
  else if (brokeAt) summary = `Broke at ${brokeAt}${err ? ` — ${err}` : ''}`
  else summary = `Status: ${run.status}`

  return { stages, brokeAt, summary }
}

function stateClass(state: StageState): string {
  switch (state) {
    case 'done':
      return 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
    case 'running':
      return 'bg-amber-900/40 border-amber-600 text-amber-200 animate-pulse'
    case 'error':
      return 'bg-red-950/60 border-red-600 text-red-300'
    case 'skipped':
      return 'bg-slate-900/40 border-slate-700 text-slate-500'
    default:
      return 'bg-slate-900/30 border-slate-700 text-slate-500'
  }
}

function stateGlyph(state: StageState): string {
  switch (state) {
    case 'done':
      return '✓'
    case 'running':
      return '●'
    case 'error':
      return '✕'
    case 'skipped':
      return '–'
    default:
      return '○'
  }
}

export function PipelineRunLogPanel({
  run,
  onRefresh,
  refreshing,
}: {
  run: PipelineRunForLog | null
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const derived = run ? deriveRunStages(run) : null

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-medium text-white">Pipeline log</h2>
        <div className="flex items-center gap-2">
          {run && (run.status === 'queued' || run.status === 'running') && (
            <span className="text-xs text-amber-300">Live · auto-refresh</span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="px-3 py-1.5 rounded bg-slate-700 text-slate-200 text-sm disabled:opacity-50"
            >
              Refresh log
            </button>
          )}
        </div>
      </div>

      {!run && <p className="text-sm text-slate-500">Queue a run to see stage progress and logs here.</p>}

      {run && derived && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="font-mono text-xs text-slate-500">{run.id.slice(0, 8)}</span>
            <strong className="text-white">{run.mode}</strong>
            <span
              className={
                run.status === 'success'
                  ? 'text-emerald-400'
                  : run.status === 'error' || run.status === 'aborted'
                    ? 'text-red-400'
                    : 'text-amber-300'
              }
            >
              {run.status}
            </span>
            <span className="text-slate-400">{derived.summary}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {derived.stages.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-600 text-xs">→</span>}
                <div
                  className={`rounded border px-2.5 py-1.5 text-xs ${stateClass(s.state)}`}
                  title={s.detail || s.state}
                >
                  <span className="mr-1.5 opacity-80">{stateGlyph(s.state)}</span>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {derived.brokeAt && (
            <p className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded px-3 py-2">
              Broke at <strong>{derived.brokeAt}</strong>
              {lastErrorLine(run.log) ? `: ${lastErrorLine(run.log)}` : ''}
            </p>
          )}

          {run.stats && Object.keys(run.stats).length > 0 && (
            <pre className="text-xs text-slate-500 overflow-x-auto whitespace-pre-wrap">
              stats: {JSON.stringify(run.stats, null, 2)}
            </pre>
          )}

          <div className="rounded border border-slate-700 bg-slate-950">
            <div className="px-3 py-1.5 border-b border-slate-800 text-xs text-slate-500 flex justify-between">
              <span>Worker log</span>
              <span>{(run.log || '').split(/\r?\n/).filter(Boolean).length} lines</span>
            </div>
            <pre className="max-h-80 overflow-auto p-3 text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
              {run.log?.trim() ? run.log : '(no log lines yet — worker may still be starting)'}
            </pre>
          </div>
        </>
      )}
    </section>
  )
}
