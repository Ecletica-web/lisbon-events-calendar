import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  getSheetsEditUrl,
  readProcessedFromSheets,
  resolveSpreadsheetId,
} from '@/lib/googleSheets'
import { PROCESSED_EVENTS_COLUMNS, projectRows } from '@/lib/pipelineSheetColumns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  if (!resolveSpreadsheetId()) {
    return NextResponse.json(
      {
        error: 'No spreadsheet id — set GOOGLE_SHEETS_ID or NEXT_PUBLIC_EVENTS_CSV_URL',
        columns: [...PROCESSED_EVENTS_COLUMNS],
        rows: [],
        sheetsUrl: null,
      },
      { status: 503 }
    )
  }
  try {
    const limit = Number(new URL(request.url).searchParams.get('limit') || 150)
    const { columns, rows } = await readProcessedFromSheets(limit)
    const cols = columns.length > 0 ? columns : [...PROCESSED_EVENTS_COLUMNS]
    return NextResponse.json({
      columns: cols,
      rows: projectRows(rows, cols),
      sheetsUrl: getSheetsEditUrl(),
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed',
        columns: [...PROCESSED_EVENTS_COLUMNS],
        rows: [],
        sheetsUrl: getSheetsEditUrl(),
      },
      { status: 500 }
    )
  }
}
