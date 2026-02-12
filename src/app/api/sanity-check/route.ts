/**
 * Dev-only sanity-check API.
 * Returns ingestion stats: total rows, loaded, quarantined (by reason), unknown venues, duplicates merged.
 */

import { NextResponse } from 'next/server'
import { loadEvents } from '@/data/loaders/eventsLoader'
import { loadVenues } from '@/data/loaders/venuesLoader'
import { buildVenueIndex } from '@/data/venueIndex'
import type { QuarantineReason } from '@/data/loaders/eventsLoader'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const csvUrl = process.env.NEXT_PUBLIC_EVENTS_CSV_URL
  if (!csvUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_EVENTS_CSV_URL is not set' },
      { status: 500 }
    )
  }

  try {
    const venuesUrl = process.env.NEXT_PUBLIC_VENUES_CSV_URL
    const { venues } = await loadVenues(venuesUrl)
    const venueIndex = buildVenueIndex(venues)

    const { events, quarantined, stats } = await loadEvents(csvUrl, venueIndex)

    const quarantinedByReason: Record<QuarantineReason, number> = {
      missing_event_id: 0,
      missing_title: 0,
      missing_start_datetime: 0,
      invalid_datetime: 0,
      venue_resolution_failed: 0,
      parse_error: 0,
      unknown: 0,
    }
    for (const q of quarantined) {
      quarantinedByReason[q.reason] = (quarantinedByReason[q.reason] ?? 0) + 1
    }

    return NextResponse.json({
      stats: {
        ...stats,
        listingCount: events.length,
      },
      quarantinedByReason,
    })
  } catch (err) {
    console.error('[sanity-check]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
