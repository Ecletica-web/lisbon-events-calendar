import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  listReviewQueue,
  resolveReviewItem,
  reviewToProcessedRow,
} from '@/lib/adminPipeline'
import {
  appendProcessedToSheets,
  getSheetsEditUrl,
  isAppSheetsWriteConfigured,
  readNeedsReviewFromSheets,
} from '@/lib/googleSheets'
import { NEEDS_REVIEW_COLUMNS, projectRows } from '@/lib/pipelineSheetColumns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const status = (new URL(request.url).searchParams.get('status') || 'pending') as
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'all'
  try {
    const sbRows = await listReviewQueue(status)
    let rows = projectRows(sbRows as Record<string, unknown>[], NEEDS_REVIEW_COLUMNS)
    let source: 'supabase' | 'sheets' = 'supabase'

    if (rows.length === 0 && (status === 'pending' || status === 'all')) {
      const sheet = await readNeedsReviewFromSheets(200).catch(() => null)
      if (sheet && sheet.rows.length > 0) {
        source = 'sheets'
        rows = projectRows(sheet.rows, NEEDS_REVIEW_COLUMNS)
      }
    }

    return NextResponse.json({
      columns: [...NEEDS_REVIEW_COLUMNS],
      rows,
      source,
      sheetsUrl: getSheetsEditUrl(),
      canWriteSheets: isAppSheetsWriteConfigured(),
      sheetsWriteMode: isAppSheetsWriteConfigured() ? 'auto' : 'manual',
    })
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
  const body = await request.json().catch(() => null)
  if (!body?.reviewId || !['approved', 'rejected'].includes(body.action)) {
    return NextResponse.json(
      { error: 'reviewId and action (approved|rejected) required' },
      { status: 400 }
    )
  }

  try {
    const fieldEdits =
      body.fieldEdits && typeof body.fieldEdits === 'object'
        ? (body.fieldEdits as Record<string, string>)
        : undefined

    const pending = await listReviewQueue('pending')
    const previous = pending.find((r) => r.review_id === String(body.reviewId))

    let processedAppended = false
    let processedRow: Record<string, string> | null = null

    if (body.action === 'approved') {
      const source =
        previous ??
        (await listReviewQueue('all')).find((r) => r.review_id === String(body.reviewId))
      if (!source) {
        return NextResponse.json({ error: 'Review item not found' }, { status: 404 })
      }
      if (source.review_status !== 'pending') {
        return NextResponse.json({ error: 'Already resolved' }, { status: 409 })
      }
      processedRow = reviewToProcessedRow(source as Record<string, unknown>, fieldEdits)

      if (isAppSheetsWriteConfigured()) {
        await appendProcessedToSheets(processedRow)
        processedAppended = true
      }
    }

    const { updated } = await resolveReviewItem({
      reviewId: String(body.reviewId),
      action: body.action,
      resolvedBy: auth.email,
      fieldEdits,
    })

    return NextResponse.json({
      updated,
      processedAppended,
      processedRow,
      message: processedAppended
        ? 'Approved and appended to Processed Events sheet'
        : body.action === 'approved'
          ? 'Approved in Supabase. Paste processedRow into the Processed Events sheet (Sheets auto-write is off).'
          : 'Rejected',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
