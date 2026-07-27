/**
 * One-off: push archived venue-images → Venues/Promoters sheets (no Apify, no pipeline_runs).
 *   npx tsx scripts/push-profile-images-to-sheets.ts [--force]
 */
import { readPipelineWatchlist } from '../sinks/catalog-store'
import { syncProfileImages } from '../media/venue-profile-images'

async function main() {
  const force = process.argv.includes('--force')
  const watchlist = await readPipelineWatchlist()
  console.log(`[push] active catalog rows: ${watchlist.filter((w) => w.active).length}`)
  const result = await syncProfileImages(watchlist, {
    sheetsOnly: true,
    force,
    log: (line) => console.log(line),
  })
  console.log('[push] done', JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
