import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  listCatalogCandidates,
  approveCatalogCandidate,
  rejectCatalogCandidate,
  type CatalogCandidateKind,
  type CatalogCandidateStatus,
} from '@/lib/adminCatalogCandidates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const status = (request.nextUrl.searchParams.get('status') ||
      'pending') as CatalogCandidateStatus | 'all'
    const kind = (request.nextUrl.searchParams.get('kind') || 'all') as
      | CatalogCandidateKind
      | 'all'
    const candidates = await listCatalogCandidates(status, kind)
    return NextResponse.json({ candidates, total: candidates.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed', candidates: [] },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => null)) as {
    action?: 'approve' | 'reject'
    id?: string
    kind?: CatalogCandidateKind
    name?: string
    instagram_handle?: string
    city?: string
    neighborhood?: string
    address?: string
    aliases?: string
    venue_id?: string
    promoter_id?: string
    notes?: string
  } | null

  if (!body?.id || !body.action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 })
  }

  const resolvedBy = auth.email || 'admin'

  try {
    if (body.action === 'reject') {
      await rejectCatalogCandidate(body.id, resolvedBy, body.notes)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'approve') {
      if (!body.name?.trim() || !body.kind) {
        return NextResponse.json({ error: 'name and kind required for approve' }, { status: 400 })
      }
      const result = await approveCatalogCandidate({
        id: body.id,
        kind: body.kind,
        name: body.name,
        instagram_handle: body.instagram_handle,
        city: body.city,
        neighborhood: body.neighborhood,
        address: body.address,
        aliases: body.aliases,
        venue_id: body.venue_id,
        promoter_id: body.promoter_id,
        resolvedBy,
        notes: body.notes,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
