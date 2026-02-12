/**
 * Venues API — fetches from CSV server-side (no CORS).
 * Client components fetch from here; server fetches CSV directly.
 */

import { NextResponse } from 'next/server'
import { fetchVenues } from '@/lib/eventsAdapter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const venues = await fetchVenues()
    return NextResponse.json(venues)
  } catch (err) {
    console.error('[api/venues]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load venues' },
      { status: 500 }
    )
  }
}
