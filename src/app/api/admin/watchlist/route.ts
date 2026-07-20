import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  getSheetsEditUrl,
  isAppSheetsConfigured,
  readWatchlistFromSheets,
  writeWatchlistToSheets,
} from '@/lib/googleSheets'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  if (!isAppSheetsConfigured()) {
    return NextResponse.json(
      { error: 'GOOGLE_SHEETS_ID / GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON not configured', rows: [] },
      { status: 503 }
    )
  }
  try {
    const rows = await readWatchlistFromSheets()
    return NextResponse.json({ rows, sheetsUrl: getSheetsEditUrl() })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  if (!isAppSheetsConfigured()) {
    return NextResponse.json({ error: 'Sheets not configured' }, { status: 503 })
  }
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'rows array required' }, { status: 400 })
  }
  try {
    const entries = body.rows.map(
      (r: { handle?: string; type?: string; active?: boolean; notes?: string }) => ({
        handle: String(r.handle || '')
          .replace(/^@/, '')
          .toLowerCase()
          .trim(),
        type: r.type === 'promoter' ? 'promoter' : 'venue',
        active: r.active !== false,
        notes: String(r.notes || ''),
      })
    )
    await writeWatchlistToSheets(entries.filter((e: { handle: string }) => e.handle))
    const rows = await readWatchlistFromSheets()
    return NextResponse.json({ rows, sheetsUrl: getSheetsEditUrl() })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
