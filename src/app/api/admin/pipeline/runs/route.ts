import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  enqueuePipelineRun,
  listPipelineRuns,
  requestAbortRun,
} from '@/lib/adminPipeline'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const runs = await listPipelineRuns(20)
    return NextResponse.json({ runs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list runs' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const action = body.action as string | undefined

  try {
    if (action === 'abort') {
      const runId = String(body.runId || '')
      if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 })
      const run = await requestAbortRun(runId)
      return NextResponse.json({ run })
    }

    const mode = body.mode as string
    if (!['scrape', 'extract', 'verify', 'full'].includes(mode)) {
      return NextResponse.json({ error: 'mode must be scrape|extract|verify|full' }, { status: 400 })
    }

    const runParams: Record<string, unknown> = {}
    if (body.handle) runParams.handle = String(body.handle).replace(/^@/, '').toLowerCase()
    if (body.limit != null) runParams.limit = Number(body.limit)
    if (body.forceVision) runParams.forceVision = true
    if (body.skipVerify) runParams.skipVerify = true
    if (body.postMaxAgeDays != null) runParams.postMaxAgeDays = Number(body.postMaxAgeDays)

    const run = await enqueuePipelineRun({
      mode: mode as 'scrape' | 'extract' | 'verify' | 'full',
      runParams,
      requestedBy: auth.email,
    })
    return NextResponse.json({ run })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
