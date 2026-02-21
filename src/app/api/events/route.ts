/**
 * Events API — fetches from Google Sheets server-side (no CORS).
 * Cached 5 min (unstable_cache in fetchEvents + route revalidate).
 * Marked dynamic so build does not run loaders (no-store fetch to Sheets).
 */
import { NextResponse } from 'next/server'
import { fetchEvents } from '@/lib/eventsAdapter'

export const dynamic = 'force-dynamic'
export const revalidate = 300

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
