import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { restartPipelineWorker } from '@/lib/adminWorkerControl'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action : 'restart'
  if (action !== 'restart') {
    return NextResponse.json({ error: 'action must be restart' }, { status: 400 })
  }

  try {
    const result = await restartPipelineWorker()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to restart worker' },
      { status: 500 }
    )
  }
}
