import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getPipelinePostDetail, listPipelinePosts } from '@/lib/adminPipeline'
import { getSheetsEditUrl, readEventsRawFromSheets } from '@/lib/googleSheets'
import { EVENTS_RAW_COLUMNS, projectRows } from '@/lib/pipelineSheetColumns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  try {
    if (id) {
      const detail = await getPipelinePostDetail(id)
      return NextResponse.json(detail)
    }

    const limit = Number(searchParams.get('limit') || 50)
    const offset = Number(searchParams.get('offset') || 0)
    const result = await listPipelinePosts({
      q: searchParams.get('q') || undefined,
      handle: searchParams.get('handle') || undefined,
      status: searchParams.get('status') || undefined,
      mediaType: searchParams.get('mediaType') || undefined,
      limit,
      offset,
    })

    const adminColumns = ['processing_status', ...EVENTS_RAW_COLUMNS] as const
    let rows = projectRows(
      (result.rows as Record<string, unknown>[]).map((r) => ({
        ...r,
        processing_status: r.processing_status,
      })),
      adminColumns
    )
    let total = result.total
    let source: 'supabase' | 'sheets' = 'supabase'

    // New Supabase project is empty until scrape/backfill — fall back to Events_Raw sheet
    if (total === 0 && !searchParams.get('status')) {
      const sheet = await readEventsRawFromSheets(limit + offset).catch(() => null)
      if (sheet && sheet.rows.length > 0) {
        source = 'sheets'
        let filtered = sheet.rows
        const handle = (searchParams.get('handle') || '').trim().toLowerCase()
        const q = (searchParams.get('q') || '').trim().toLowerCase()
        if (handle) {
          filtered = filtered.filter((r) =>
            (r.owner_username || r.ownerUsername || '').toLowerCase().includes(handle)
          )
        }
        if (q) {
          filtered = filtered.filter((r) =>
            [r.caption, r.shortCode, r.id, r.source_event_id].join(' ').toLowerCase().includes(q)
          )
        }
        total = filtered.length
        rows = projectRows(filtered.slice(offset, offset + limit), adminColumns)
      }
    }

    return NextResponse.json({
      columns: [...adminColumns],
      rows,
      total,
      source,
      sheetsUrl: getSheetsEditUrl(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
