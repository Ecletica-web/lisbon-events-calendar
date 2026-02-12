/**
 * Events API — fetches from Google Sheets server-side (no CORS).
 * Client components fetch from here; server fetches Google directly.
 */

import { NextResponse } from 'next/server'
import { fetchEvents } from '@/lib/eventsAdapter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const events = await fetchEvents()
    return NextResponse.json(events)
  } catch (err) {
    console.error('[api/events]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load events' },
      { status: 500 }
    )
  }
}
