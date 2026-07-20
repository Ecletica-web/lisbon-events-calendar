import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { listReviewQueue } from '@/lib/adminPipeline'

export const dynamic = 'force-dynamic'

/** Legacy CSV endpoint — prefer /api/admin/pipeline/review. Still gated by admin auth. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const rows = await listReviewQueue('all')
    const needsReview = rows.map((r) => ({
      id: r.review_id,
      imageUrl: r.stored_image_url || r.thumbnail_url || undefined,
      title: r.description_short || 'Needs review',
      venueName: r.venue_name_raw || undefined,
      start: r.start_datetime || undefined,
      descriptionLong: r.description_long || r.caption || undefined,
      validationStatus: r.validation_status || undefined,
      validationReasons: r.validation_reasons || undefined,
      verificationVerdict: r.verification_verdict || undefined,
      verificationNotes: r.verification_notes || undefined,
      verificationSources: r.verification_sources || undefined,
      suggestedCorrections: r.suggested_corrections || undefined,
      tags: [] as string[],
      rawRow: r,
    }))
    return NextResponse.json({
      raw: [],
      needsReview,
      processed: [],
    })
  } catch (error) {
    console.error('Event review fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
