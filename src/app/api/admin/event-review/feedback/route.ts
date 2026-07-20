import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import {
  listReviewFeedback,
  parseFeedbackBody,
  upsertReviewFeedback,
} from '@/lib/adminEventReviewFeedback'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { data, error } = await listReviewFeedback()
  if (error) return NextResponse.json({ error }, { status: 503 })
  return NextResponse.json({ feedback: data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null)
  const feedback = parseFeedbackBody(body)
  if (!feedback) {
    return NextResponse.json({ error: 'Invalid feedback body' }, { status: 400 })
  }
  const { error } = await upsertReviewFeedback(feedback)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
