/**
 * Expire past-dated pending review queue rows (Supabase SoT).
 *
 * Usage (from pipeline/):
 *   npx tsx scripts/expire-review-queue.ts           # dry-run report
 *   npx tsx scripts/expire-review-queue.ts --apply   # mark rejected as expired
 */

import {
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

async function main(): Promise<void> {
  if (!isSupabaseStoreConfigured()) {
    console.error('[expire-review] Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const now = new Date()
  const pending = await listPendingReviewQueue()
  const expired = pending.filter((r) => isPastStart(r.start_datetime, now))

  console.log(
    `[expire-review] pending=${pending.length} past_start=${expired.length} mode=${apply ? 'APPLY' : 'dry-run'}`
  )
  for (const r of expired.slice(0, 30)) {
    console.log(
      `  - ${r.review_id} | ${r.start_datetime} | ${String(r.description_short || '').slice(0, 60)}`
    )
  }
  if (expired.length > 30) console.log(`  … +${expired.length - 30} more`)

  if (!apply) {
    console.log('[expire-review] re-run with --apply to mark past rows as rejected (resolved_by=expire-review-queue)')
    return
  }

  const ids = expired.map((r) => String(r.review_id || '')).filter(Boolean)
  const n = await resolveReviewQueueItems(ids, 'rejected', 'expire-review-queue', false)
  console.log(`[expire-review] marked rejected=${n}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
