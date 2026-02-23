import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import { fetchReviewCsvs } from '@/lib/adminEventReview'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await fetchReviewCsvs()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Event review fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
