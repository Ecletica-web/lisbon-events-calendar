/**
 * Expire / reject past-dated pending review queue rows (Supabase SoT).
 * Matches by start_datetime in the past OR validation_reasons containing past_event.
 * Also marks linked pipeline_posts as discarded when every pending row for that
 * source is rejected.
 *
 * Usage (from pipeline/):
 *   npx tsx scripts/expire-review-queue.ts           # dry-run report
 *   npx tsx scripts/expire-review-queue.ts --apply   # reject + discard posts
 */

import {
  getSupabaseStore,
  isSupabaseStoreConfigured,
  listPendingReviewQueue,
  resolveReviewQueueItems,
} from '../sinks/supabase-store'

const apply = process.argv.includes('--apply')

function isPastStart(start: unknown, now: Date): boolean {
  const raw = String(start || '').trim()
  if (!raw) return false
  const d = new Date(raw)
  return !isNaN(d.getTime()) && d.getTime() < now.getTime()
}

function hasPastEventReason(reasons: unknown): boolean {
  return String(reasons || '')
    .split(/[|;,\n]/)
    .map((s) => s.trim())
    .includes('past_event')
}

async function main(): Promise<void> {
  if (!isSupabaseStoreConfigured()) {
    console.error('[expire-review] Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const now = new Date()
  const pending = await listPendingReviewQueue()
  const expired = pending.filter(
    (r) => isPastStart(r.start_datetime, now) || hasPastEventReason(r.validation_reasons)
  )

  console.log(
    `[expire-review] pending=${pending.length} past_or_past_event=${expired.length} mode=${apply ? 'APPLY' : 'dry-run'}`
  )
  for (const r of expired.slice(0, 40)) {
    console.log(
      `  - ${r.review_id} | ${r.start_datetime} | ${String(r.validation_reasons || '').slice(0, 80)} | ${String(r.description_short || r.title || '').slice(0, 50)}`
    )
  }
  if (expired.length > 40) console.log(`  … +${expired.length - 40} more`)

  if (!apply) {
    console.log(
      '[expire-review] re-run with --apply to mark rejected (resolved_by=expire-review-queue) and discard linked posts'
    )
    return
  }

  const ids = expired.map((r) => String(r.review_id || '')).filter(Boolean)
  const n = await resolveReviewQueueItems(ids, 'rejected', 'expire-review-queue', false)
  console.log(`[expire-review] marked rejected=${n}`)

  const sourceIds = [
    ...new Set(expired.map((r) => String(r.source_event_id || '')).filter(Boolean)),
  ]
  if (sourceIds.length === 0) return

  const sb = getSupabaseStore()
  const { data: updated, error } = await sb
    .from('pipeline_posts')
    .update({ processing_status: 'discarded', updated_at: new Date().toISOString() })
    .in('source_event_id', sourceIds)
    .in('processing_status', ['needs_review', 'new'])
    .select('id')
  if (error) throw new Error(error.message)
  console.log(`[expire-review] posts discarded=${updated?.length ?? 0} (from ${sourceIds.length} source_event_id(s))`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
