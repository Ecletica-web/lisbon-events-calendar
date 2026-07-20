import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  getSheetsEditUrl,
  isAppSheetsConfigured,
  readProcessedFromSheets,
} from '@/lib/googleSheets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  if (!isAppSheetsConfigured()) {
    return NextResponse.json(
      { error: 'Sheets not configured', rows: [], sheetsUrl: null },
      { status: 503 }
    )
  }
  try {
    const limit = Number(new URL(request.url).searchParams.get('limit') || 100)
    const rows = await readProcessedFromSheets(limit)
    return NextResponse.json({ rows, sheetsUrl: getSheetsEditUrl() })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
