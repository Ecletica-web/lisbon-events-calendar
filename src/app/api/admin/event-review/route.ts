import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { listReviewQueue } from '@/lib/adminPipeline'

export const dynamic = 'force-dynamic'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/** Legacy CSV endpoint — prefer /api/admin/pipeline/review. Still gated by admin auth. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const listed = await listReviewQueue('all', { page: 1, pageSize: 100 })
    const needsReview = listed.rows.map((r) => ({
      id: str(r.review_id),
      imageUrl: str(r.stored_image_url) || str(r.thumbnail_url) || undefined,
      title: str(r.description_short) || 'Needs review',
      venueName: str(r.venue_name_raw) || undefined,
      start: str(r.start_datetime) || undefined,
      descriptionLong: str(r.description_long) || str(r.caption) || undefined,
      validationStatus: str(r.validation_status) || undefined,
      validationReasons: str(r.validation_reasons) || undefined,
      verificationVerdict: str(r.verification_verdict) || undefined,
      verificationNotes: str(r.verification_notes) || undefined,
      verificationSources: str(r.verification_sources) || undefined,
      suggestedCorrections: str(r.suggested_corrections) || undefined,
      tags: [] as string[],
      rawRow: r,
    }))
    return NextResponse.json({
      raw: [],
      needsReview,
      processed: [],
      total: listed.total,
    })
  } catch (error) {
    console.error('Event review fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
