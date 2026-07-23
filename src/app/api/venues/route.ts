/**
 * Venues API — CSV + Fontes IG split, server-side (no CORS).
 */

import { NextResponse } from 'next/server'
import { loadVenuesForDisplay } from '@/lib/catalogLoaders'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const venues = await loadVenuesForDisplay()
    return NextResponse.json(venues)
  } catch (err) {
    console.error('[api/venues]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load venues' },
      { status: 500 }
    )
  }
}
