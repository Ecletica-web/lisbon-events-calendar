/**
 * Pipeline worker — polls Supabase `pipeline_runs` for queued jobs and executes them.
 *
 *   cd pipeline && npm run worker
 *
 * Keep this running on a machine with Apify/OpenAI/ffmpeg access (not Vercel).
 */

import { getConfig } from '../config'
import {
  appendRunLogLine,
  claimNextQueuedRun,
  isAbortRequested,
  isSupabaseStoreConfigured,
  PipelineAbortedError,
  touchWorkerHeartbeat,
  updatePipelineRun,
} from '../sinks/supabase-store'
import { parseFlags, runCommand, type CliFlags } from './run'

const POLL_MS = 10_000

function isAbortError(err: unknown): boolean {
  return (
    err instanceof PipelineAbortedError ||
    (err instanceof Error && err.name === 'PipelineAbortedError')
  )
}

async function executeRun(run: {
  id: string
  mode: string
  params: Record<string, unknown>
}): Promise<void> {
  const params = run.params ?? {}
  const command =
    typeof params.pipelineCommand === 'string' && params.pipelineCommand
      ? params.pipelineCommand
      : run.mode
  const argv: string[] = [command]
  if (typeof params.handle === 'string' && params.handle) argv.push(`--handle=${params.handle}`)
  if (typeof params.limit === 'number' && params.limit > 0) argv.push(`--limit=${params.limit}`)
  const maxAge =
    typeof params.postMaxAgeDays === 'number'
      ? params.postMaxAgeDays
      : typeof params.post_max_age_days === 'number'
        ? params.post_max_age_days
        : null
  if (maxAge != null && maxAge > 0) argv.push(`--max-age-days=${maxAge}`)
  if (params.forceVision === true || params.force_vision === true) argv.push('--force-vision')
  if (params.skipVerify === true || params.skip_verify === true) argv.push('--skip-verify')
  if (params.dryRun === true || params.dry_run === true) argv.push('--dry-run')
  if (params.syncVenueImages === false || params.sync_venue_images === false) {
    argv.push('--skip-venue-images')
  }
  if (params.forceVenueImages === true || params.force_venue_images === true) {
    argv.push('--force-venue-images')
  }
  argv.push(`--run-id=${run.id}`)

  const flags: CliFlags = parseFlags(argv)
  flags.runId = run.id

  await appendRunLogLine(run.id, `Worker claimed run mode=${run.mode}`)

  if (await isAbortRequested(run.id)) {
    await appendRunLogLine(run.id, '=== ABORTED === before start')
    await updatePipelineRun(run.id, {
      status: 'aborted',
      finished_at: new Date().toISOString(),
    })
    return
  }

  try {
    const stats = await runCommand(flags)
    if (await isAbortRequested(run.id)) {
      await appendRunLogLine(run.id, '=== ABORTED === after command')
      await updatePipelineRun(run.id, {
        status: 'aborted',
        stats,
        finished_at: new Date().toISOString(),
      })
      return
    }
    await updatePipelineRun(run.id, {
      status: 'success',
      stats,
      finished_at: new Date().toISOString(),
    })
    await appendRunLogLine(run.id, 'Worker finished successfully')
  } catch (err) {
    if (isAbortError(err)) {
      await appendRunLogLine(run.id, `=== ABORTED === ${err instanceof Error ? err.message : err}`)
      await updatePipelineRun(run.id, {
        status: 'aborted',
        finished_at: new Date().toISOString(),
      })
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    await appendRunLogLine(run.id, `Worker error: ${message}`)
    await updatePipelineRun(run.id, {
      status: 'error',
      finished_at: new Date().toISOString(),
    })
  }
}

async function tick(): Promise<void> {
  await touchWorkerHeartbeat()
  const run = await claimNextQueuedRun()
  if (!run) return
  console.log(`[worker] claimed ${run.id} mode=${run.mode}`)
  await executeRun(run)
}

async function main(): Promise<void> {
  getConfig()
  if (!isSupabaseStoreConfigured()) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the worker.')
    process.exitCode = 1
    return
  }

  console.log(`[worker] polling every ${POLL_MS / 1000}s for queued pipeline_runs…`)
  await touchWorkerHeartbeat()

  for (;;) {
    try {
      await tick()
    } catch (err) {
      console.error('[worker] tick error:', err instanceof Error ? err.message : err)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err)
  process.exitCode = 1
})
