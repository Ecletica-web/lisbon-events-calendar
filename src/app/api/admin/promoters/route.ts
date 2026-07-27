import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  loadCatalogPromoters,
  upsertPromoter,
  setPromoterActive,
  type PromoterUpsertInput,
} from '@/lib/adminCatalog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const includeInactive = request.nextUrl.searchParams.get('all') === '1'
    const promoters = await loadCatalogPromoters({ activeOnly: !includeInactive })
    return NextResponse.json({ promoters, total: promoters.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed', promoters: [] },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => null)) as PromoterUpsertInput | null
  if (!body?.name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  try {
    const promoter = await upsertPromoter(body)
    return NextResponse.json({ promoter })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => null)) as {
    promoter_id?: string
    is_active?: boolean
  } | null
  if (!body?.promoter_id || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'promoter_id and is_active required' }, { status: 400 })
  }
  try {
    await setPromoterActive(body.promoter_id, body.is_active)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
