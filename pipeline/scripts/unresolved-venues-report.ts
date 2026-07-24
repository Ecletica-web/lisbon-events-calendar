/**
 * Rank venue_name_raw counts from pending review queue (venue-related reasons).
 *
 * Usage (from pipeline/):
 *   npx tsx scripts/unresolved-venues-report.ts
 */

import { isSupabaseStoreConfigured, listPendingReviewQueue } from '../sinks/supabase-store'

function hasVenueReason(reasons: unknown): boolean {
  const s = String(reasons || '').toLowerCase()
  return s.includes('venue_unresolved') || s.includes('venue')
}

async function main(): Promise<void> {
  if (!isSupabaseStoreConfigured()) {
    console.error('[venues-report] Supabase not configured')
    process.exit(1)
  }

  const pending = await listPendingReviewQueue()
  const counts = new Map<string, number>()
  let considered = 0

  for (const r of pending) {
    if (!hasVenueReason(r.validation_reasons)) continue
    considered++
    const raw = String(r.venue_name_raw || '').trim() || '(empty)'
    counts.set(raw, (counts.get(raw) ?? 0) + 1)
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  console.log(`# unresolved venues report — pending_venue_rows=${considered} distinct=${ranked.length}`)
  console.log('count\tvenue_name_raw')
  for (const [name, count] of ranked) {
    console.log(`${count}\t${name}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
