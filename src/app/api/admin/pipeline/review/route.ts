import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  getReviewItem,
  listReviewQueue,
  resolveReviewItem,
  reviewToProcessedRow,
  REVIEW_PAGE_SIZE_DEFAULT,
  REVIEW_PAGE_SIZE_MAX,
  type ReviewQueueStatus,
} from '@/lib/adminPipeline'
import {
  appendEventsCleanToSheets,
  appendProcessedToSheets,
  getSheetsEditUrl,
  isAppSheetsWriteConfigured,
  readNeedsReviewFromSheets,
} from '@/lib/googleSheets'
import { NEEDS_REVIEW_COLUMNS, projectRows } from '@/lib/pipelineSheetColumns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parsePaging(url: URL): { page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1)
  const rawSize = Number(url.searchParams.get('pageSize') || String(REVIEW_PAGE_SIZE_DEFAULT))
  const pageSize = Math.min(
    Math.max(Number.isFinite(rawSize) ? rawSize : REVIEW_PAGE_SIZE_DEFAULT, 1),
    REVIEW_PAGE_SIZE_MAX
  )
  return { page, pageSize }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const status = (url.searchParams.get('status') || 'pending') as ReviewQueueStatus
  const { page, pageSize } = parsePaging(url)

  try {
    const listed = await listReviewQueue(status, { page, pageSize })
    let rows = projectRows(listed.rows, NEEDS_REVIEW_COLUMNS)
    let total = listed.total
    let source: 'supabase' | 'sheets' = 'supabase'

    if (rows.length === 0 && total === 0 && (status === 'pending' || status === 'all')) {
      const sheet = await readNeedsReviewFromSheets(10_000).catch(() => null)
      if (sheet && sheet.rows.length > 0) {
        source = 'sheets'
        const all = projectRows(sheet.rows, NEEDS_REVIEW_COLUMNS)
        total = sheet.total || all.length
        const from = (page - 1) * pageSize
        rows = all.slice(from, from + pageSize)
      }
    }

    return NextResponse.json({
      columns: [...NEEDS_REVIEW_COLUMNS],
      rows,
      total,
      page,
      pageSize,
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

    const source = await getReviewItem(String(body.reviewId))
    if (!source) {
      return NextResponse.json({ error: 'Review item not found' }, { status: 404 })
    }
    if (source.review_status !== 'pending') {
      return NextResponse.json({ error: 'Already resolved' }, { status: 409 })
    }

    let processedAppended = false
    let cleanAppended = false
    let processedRow: Record<string, string> | null = null

    if (body.action === 'approved') {
      processedRow = reviewToProcessedRow(source as Record<string, unknown>, fieldEdits)

      if (isAppSheetsWriteConfigured()) {
        await appendProcessedToSheets(processedRow)
        processedAppended = true
        await appendEventsCleanToSheets(processedRow)
        cleanAppended = true
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
      cleanAppended,
      processedRow,
      message: processedAppended
        ? cleanAppended
          ? 'Approved and appended to Processed Events + Events Clean New'
          : 'Approved and appended to Processed Events sheet'
        : body.action === 'approved'
          ? 'Approved in Supabase. Paste processedRow into Processed Events / Events Clean New (Sheets auto-write is off).'
          : 'Rejected',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
