import { NextResponse } from 'next/server'
import { fetchReviewCsvs } from '@/lib/adminEventReview'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await fetchReviewCsvs()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Event review fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
