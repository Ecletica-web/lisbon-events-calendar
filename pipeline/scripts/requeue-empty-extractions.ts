/**
 * Re-queue posts behind no_events_extracted review rows, reject those stale
 * review items, and enqueue an extract run for the worker.
 *
 *   npx tsx scripts/requeue-empty-extractions.ts           # dry-run
 *   npx tsx scripts/requeue-empty-extractions.ts --apply
 */

import {
  createPipelineRun,
  getSupabaseStore,
  isSupabaseStoreConfigured,
  listPendingReviewQueue,
  requeuePipelinePostsBySourceEventIds,
  resolveReviewQueueItems,
} from '../sinks/supabase-store'

const apply = process.argv.includes('--apply')

async function main() {
  if (!isSupabaseStoreConfigured()) throw new Error('no sb')
  const sb = getSupabaseStore()
  const pending = await listPendingReviewQueue()
  const empty = pending.filter((r) =>
    String(r.validation_reasons || '')
      .split(/[|;,\n]/)
      .map((s) => s.trim())
      .includes('no_events_extracted')
  )

  const sourceIds = [
    ...new Set(
      empty
        .map((r) => String(r.source_event_id || '').trim())
        .filter(Boolean)
    ),
  ]
  const reviewIds = empty.map((r) => String(r.review_id || '')).filter(Boolean)

  console.log(
    `[requeue-empty] pending=${pending.length} no_events_extracted=${empty.length} ` +
      `unique_source_ids=${sourceIds.length} mode=${apply ? 'APPLY' : 'dry-run'}`
  )

  if (!apply) {
    console.log('[requeue-empty] re-run with --apply to reject stale reviews + requeue + extract')
    return
  }

  // Also requeue any posts still marked needs_review (covers linked empties + others)
  const { count: needsReviewCount } = await sb
    .from('pipeline_posts')
    .select('*', { count: 'exact', head: true })
    .eq('processing_status', 'needs_review')

  const { data: nrPosts, error: nrErr } = await sb
    .from('pipeline_posts')
    .select('id, source_event_id')
    .eq('processing_status', 'needs_review')
  if (nrErr) throw new Error(nrErr.message)

  const allSourceIds = [
    ...new Set([
      ...sourceIds,
      ...(nrPosts ?? []).map((p) => String(p.source_event_id || '').trim()).filter(Boolean),
    ]),
  ]

  const requeued = await requeuePipelinePostsBySourceEventIds(allSourceIds, false)
  console.log(`[requeue-empty] requeued_posts=${requeued} (needs_review_posts≈${needsReviewCount})`)

  let rejected = 0
  const CHUNK = 100
  for (let i = 0; i < reviewIds.length; i += CHUNK) {
    rejected += await resolveReviewQueueItems(
      reviewIds.slice(i, i + CHUNK),
      'rejected',
      'requeue-empty-extracted'
    )
  }
  console.log(`[requeue-empty] rejected_stale_reviews=${rejected}`)

  const runId = await createPipelineRun({
    mode: 'extract',
    requestedBy: 'requeue-empty-extracted',
    runParams: { forceVision: false, skipVerify: false },
  })
  console.log(`[requeue-empty] queued extract run=${runId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
