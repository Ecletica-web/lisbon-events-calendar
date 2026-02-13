/**
 * Filter options API — returns tags, categories, venues for persona/view filter pickers.
 */

import { NextResponse } from 'next/server'
import { fetchEvents } from '@/lib/eventsAdapter'
import {
  getAllTags,
  getAllCategories,
  getAllVenues,
  getAllPromoters,
} from '@/lib/eventsAdapter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const events = await fetchEvents()
    const tags = getAllTags(events)
    const categories = getAllCategories(events)
    const venues = getAllVenues(events)
    const promoters = getAllPromoters(events)

    return NextResponse.json({
      tags,
      categories,
      venues,
      promoters,
    })
  } catch (err) {
    console.error('[api/filter-options]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load filter options' },
      { status: 500 }
    )
  }
}
