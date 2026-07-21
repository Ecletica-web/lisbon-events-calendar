/**
 * One-off: push archived venue-images → Venues/Promoters sheets (no Apify, no pipeline_runs).
 *   npx tsx scripts/push-profile-images-to-sheets.ts [--force]
 */
import { readWatchlist } from '../sinks/sheets-writer'
import { syncProfileImages } from '../media/venue-profile-images'

async function main() {
  const force = process.argv.includes('--force')
  const watchlist = await readWatchlist()
  console.log(`[push] active Fontes IG rows: ${watchlist.filter((w) => w.active).length}`)
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
