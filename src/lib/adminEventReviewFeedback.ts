/**
 * Persistence for /admin/event-review quality ratings (event_review_feedback table).
 * Used by the admin feedback API route only.
 */

import { supabaseServer } from '@/lib/supabase/server'

export interface ReviewFeedback {
  review_id: string
  dataset: 'raw' | 'needsReview' | 'processed'
  source_event_id?: string
  quality_rating?: number
  notes?: string
  field_corrections?: Record<string, string>
  reviewed_at?: string
}

const DATASETS = ['raw', 'needsReview', 'processed'] as const

/** Parse + validate a feedback upsert body; returns null when invalid. */
export function parseFeedbackBody(body: unknown): ReviewFeedback | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const reviewId = typeof b.review_id === 'string' ? b.review_id.trim() : ''
  const dataset = typeof b.dataset === 'string' ? b.dataset : ''
  if (!reviewId || !DATASETS.includes(dataset as (typeof DATASETS)[number])) return null

  const quality = typeof b.quality_rating === 'number' ? Math.round(b.quality_rating) : undefined
  if (quality !== undefined && (quality < 1 || quality > 10)) return null

  return {
    review_id: reviewId,
    dataset: dataset as ReviewFeedback['dataset'],
    source_event_id: typeof b.source_event_id === 'string' ? b.source_event_id.trim() || undefined : undefined,
    quality_rating: quality,
    notes: typeof b.notes === 'string' ? b.notes : undefined,
    field_corrections:
      b.field_corrections && typeof b.field_corrections === 'object'
        ? (b.field_corrections as Record<string, string>)
        : undefined,
  }
}

export async function upsertReviewFeedback(feedback: ReviewFeedback): Promise<{ error?: string }> {
  if (!supabaseServer) return { error: 'Supabase not configured' }
  const { error } = await supabaseServer
    .from('event_review_feedback')
    .upsert(
      { ...feedback, reviewed_at: new Date().toISOString() },
      { onConflict: 'review_id,dataset' }
    )
  return error ? { error: error.message } : {}
}

export async function listReviewFeedback(): Promise<{ data: ReviewFeedback[]; error?: string }> {
  if (!supabaseServer) return { data: [], error: 'Supabase not configured' }
  const { data, error } = await supabaseServer
    .from('event_review_feedback')
    .select('review_id, dataset, source_event_id, quality_rating, notes, field_corrections, reviewed_at')
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ReviewFeedback[] }
}
