import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  getSheetsEditUrl,
  isAppSheetsWriteConfigured,
  readWatchlistFromSheets,
  resolveSpreadsheetId,
  writeWatchlistToSheets,
} from '@/lib/googleSheets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  if (!resolveSpreadsheetId()) {
    return NextResponse.json(
      {
        error:
          'No spreadsheet id — set GOOGLE_SHEETS_ID or NEXT_PUBLIC_EVENTS_CSV_URL',
        rows: [],
        canWrite: false,
      },
      { status: 503 }
    )
  }
  try {
    const rows = await readWatchlistFromSheets()
    return NextResponse.json({
      rows,
      sheetsUrl: getSheetsEditUrl(),
      canWrite: isAppSheetsWriteConfigured(),
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed',
        rows: [],
        canWrite: isAppSheetsWriteConfigured(),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  if (!isAppSheetsWriteConfigured()) {
    return NextResponse.json(
      {
        error:
          'Sheets write needs GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON (and sheet shared with that service account)',
      },
      { status: 503 }
    )
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
    return NextResponse.json({
      rows,
      sheetsUrl: getSheetsEditUrl(),
      canWrite: true,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
