import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getPipelineConfig, savePipelineConfig } from '@/lib/adminPipeline'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const config = await getPipelineConfig()
    return NextResponse.json({ config })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null)
  if (!body || body.config_json === undefined) {
    return NextResponse.json({ error: 'config_json required' }, { status: 400 })
  }
  try {
    const config = await savePipelineConfig(body.config_json)
    return NextResponse.json({ config })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
