import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  loadCatalogVenuesWithFallback,
  upsertVenue,
  setVenueActive,
  type VenueUpsertInput,
} from '@/lib/adminCatalog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const includeInactive = request.nextUrl.searchParams.get('all') === '1'
    const { rows: venues, source, warning } = await loadCatalogVenuesWithFallback({
      activeOnly: !includeInactive,
    })
    return NextResponse.json({ venues, total: venues.length, source, warning })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed', venues: [] },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => null)) as VenueUpsertInput | null
  if (!body?.name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  try {
    const venue = await upsertVenue(body)
    return NextResponse.json({ venue })
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
    venue_id?: string
    is_active?: boolean
  } | null
  if (!body?.venue_id || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'venue_id and is_active required' }, { status: 400 })
  }
  try {
    await setVenueActive(body.venue_id, body.is_active)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
