/**
 * Batch-dedupe pending catalog candidates vs venues/promoters + among themselves.
 *
 *   npx tsx scripts/dedupe-catalog-candidates.ts           # dry-run
 *   npx tsx scripts/dedupe-catalog-candidates.ts --apply   # merge duplicates
 *   npx tsx scripts/dedupe-catalog-candidates.ts --apply --no-llm
 */

import { scanPendingCatalogCandidates } from '../sinks/catalog-candidate-dedupe'

const apply = process.argv.includes('--apply')
const useLlm = !process.argv.includes('--no-llm')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 200

async function main(): Promise<void> {
  console.log(
    `[dedupe-catalog] mode=${apply ? 'APPLY' : 'dry-run'} llm=${useLlm} limit=${limit}`
  )
  const stats = await scanPendingCatalogCandidates({
    limit: Number.isFinite(limit) ? limit : 200,
    useLlm,
    dryRun: !apply,
  })
  console.log('[dedupe-catalog] done', stats)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
