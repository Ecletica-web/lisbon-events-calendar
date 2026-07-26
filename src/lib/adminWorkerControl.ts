/**
 * Local pipeline worker control for admin "Restart worker".
 * Signals via Supabase + kill/respawn when Next is running on the same machine.
 */

import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { supabaseServer } from '@/lib/supabase/server'

const PID_FILE = path.join(process.cwd(), 'pipeline', '.worker.pid')
const PIPELINE_DIR = path.join(process.cwd(), 'pipeline')

export type RestartWorkerResult = {
  signaled: boolean
  killed: boolean
  spawned: boolean
  requeued: number
  message: string
}

function sb() {
  if (!supabaseServer) throw new Error('Supabase not configured')
  return supabaseServer
}

function readPid(): number | null {
  try {
    if (!fs.existsSync(PID_FILE)) return null
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim()
    const pid = Number(raw)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function clearPidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
  } catch {
    /* ignore */
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killPidTree(pid: number): boolean {
  if (!isPidAlive(pid)) {
    clearPidFile()
    return false
  }
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* ignore */
      }
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* process may already be gone */
  }
  clearPidFile()
  return true
}

async function signalRestartRequest(): Promise<void> {
  const client = sb()
  const { data } = await client
    .from('pipeline_config')
    .select('config_json')
    .eq('id', 'default')
    .maybeSingle()
  const prev =
    data?.config_json && typeof data.config_json === 'object' && !Array.isArray(data.config_json)
      ? (data.config_json as Record<string, unknown>)
      : {}
  const { error } = await client.from('pipeline_config').upsert({
    id: 'default',
    config_json: {
      ...prev,
      worker_restart_requested_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

async function requeueStuckRuns(): Promise<number> {
  const client = sb()
  const { data, error } = await client
    .from('pipeline_runs')
    .update({
      status: 'queued',
      started_at: null,
      heartbeat_at: null,
    })
    .in('status', ['running', 'abort_requested'])
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

function canSpawnLocally(): boolean {
  if (process.env.VERCEL) return false
  if (!fs.existsSync(path.join(PIPELINE_DIR, 'package.json'))) return false
  return true
}

function spawnWorker(): boolean {
  if (!canSpawnLocally()) return false
  const child = spawn('npm', ['run', 'worker'], {
    cwd: PIPELINE_DIR,
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,
    env: process.env,
  })
  child.unref()
  return true
}

function killOrphanWorkerProcesses(): void {
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'cli[\\\\/]worker\\.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: 'ignore', timeout: 20000 }
      )
    } else {
      try {
        execFileSync('pkill', ['-f', 'cli/worker.ts'], { stdio: 'ignore' })
      } catch {
        /* no matches */
      }
    }
  } catch {
    /* best-effort */
  }
  clearPidFile()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function restartPipelineWorker(): Promise<RestartWorkerResult> {
  await signalRestartRequest()

  // Give a live worker a moment to finish its idle tick and exit cleanly.
  await sleep(2500)

  const pid = readPid()
  let killed = false
  if (pid != null) {
    killed = killPidTree(pid)
  }
  // Sweep orphans (workers started before PID file support, or tsx parents).
  if (canSpawnLocally()) {
    killOrphanWorkerProcesses()
    killed = true
  }

  const requeued = await requeueStuckRuns()
  const spawned = spawnWorker()

  const parts: string[] = ['Restart signaled.']
  if (killed) parts.push(pid != null ? `Stopped worker (pid ${pid}).` : 'Stopped worker process(es).')
  if (requeued > 0) parts.push(`Re-queued ${requeued} in-flight run(s).`)
  if (spawned) {
    parts.push('Spawned a new worker process.')
  } else if (process.env.VERCEL) {
    parts.push(
      'This host cannot spawn the worker — start it on your machine: cd pipeline && npm run worker'
    )
  } else {
    parts.push('Could not spawn worker — run: cd pipeline && npm run worker')
  }

  return {
    signaled: true,
    killed,
    spawned,
    requeued,
    message: parts.join(' '),
  }
}
