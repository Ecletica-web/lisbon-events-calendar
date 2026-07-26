import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  isBugReportStatus,
  listBugReports,
  updateBugReport,
} from '@/lib/userBugReports'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { data, error } = await listBugReports()
  if (error) return NextResponse.json({ error }, { status: 503 })
  return NextResponse.json({ reports: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const id = typeof (body as { id?: unknown }).id === 'string' ? (body as { id: string }).id : ''
  const status = (body as { status?: unknown }).status
  const admin_notes = (body as { admin_notes?: unknown }).admin_notes

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (status !== undefined && !isBugReportStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await updateBugReport(id, {
    status: isBugReportStatus(status) ? status : undefined,
    admin_notes: typeof admin_notes === 'string' ? admin_notes : undefined,
  })
  if (error) {
    const code = error === 'Not found' ? 404 : 500
    return NextResponse.json({ error }, { status: code })
  }
  return NextResponse.json({ report: data })
}
