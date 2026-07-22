import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  enqueuePipelineRun,
  getPipelinePostDetail,
  listPipelinePosts,
  requeuePipelinePosts,
} from '@/lib/adminPipeline'
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

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const action = String(body.action || '')
  if (action !== 'requeue') {
    return NextResponse.json({ error: 'action must be requeue' }, { status: 400 })
  }

  try {
    const statusesRaw = Array.isArray(body.statuses)
      ? body.statuses.map(String)
      : String(body.statuses || 'processed,needs_review,discarded').split(',')
    const allowed = new Set(['processed', 'needs_review', 'discarded'])
    const statuses = statusesRaw
      .map((s) => s.trim())
      .filter((s): s is 'processed' | 'needs_review' | 'discarded' => allowed.has(s))

    const postedSinceDays =
      body.postedSinceDays != null && body.postedSinceDays !== ''
        ? Number(body.postedSinceDays)
        : undefined
    const scrapedSinceDays =
      body.scrapedSinceDays != null && body.scrapedSinceDays !== ''
        ? Number(body.scrapedSinceDays)
        : undefined
    const limit = body.limit != null && body.limit !== '' ? Number(body.limit) : undefined

    if (postedSinceDays != null && (!Number.isFinite(postedSinceDays) || postedSinceDays < 1)) {
      return NextResponse.json({ error: 'postedSinceDays must be >= 1' }, { status: 400 })
    }
    if (scrapedSinceDays != null && (!Number.isFinite(scrapedSinceDays) || scrapedSinceDays < 1)) {
      return NextResponse.json({ error: 'scrapedSinceDays must be >= 1' }, { status: 400 })
    }
    if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
      return NextResponse.json({ error: 'limit must be >= 1' }, { status: 400 })
    }

    const result = await requeuePipelinePosts({
      handle: body.handle ? String(body.handle).replace(/^@/, '').toLowerCase() : undefined,
      statuses,
      postedSinceDays: postedSinceDays != null ? Math.floor(postedSinceDays) : undefined,
      scrapedSinceDays: scrapedSinceDays != null ? Math.floor(scrapedSinceDays) : undefined,
      limit: limit != null ? Math.floor(limit) : undefined,
    })

    let run = null
    if (body.enqueueExtract) {
      const runParams: Record<string, unknown> = {}
      if (body.handle) runParams.handle = String(body.handle).replace(/^@/, '').toLowerCase()
      if (limit != null) runParams.limit = Math.floor(limit)
      if (body.forceVision) runParams.forceVision = true
      if (body.skipVerify) runParams.skipVerify = true
      run = await enqueuePipelineRun({
        mode: 'extract',
        runParams,
        requestedBy: auth.email,
      })
    }

    return NextResponse.json({ ...result, run })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
