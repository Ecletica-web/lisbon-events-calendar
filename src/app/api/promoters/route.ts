/**
 * Promoters API — fetches from CSV server-side (no CORS), split via Fontes IG.
 */

import { NextResponse } from 'next/server'
import { fetchPromoters } from '@/lib/eventsAdapter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const promoters = await fetchPromoters()
    return NextResponse.json(promoters)
  } catch (err) {
    console.error('[api/promoters]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load promoters' },
      { status: 500 }
    )
  }
}
