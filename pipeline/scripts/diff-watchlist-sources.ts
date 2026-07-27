/**
 * Diff Fontes IG handles vs Venues/Promoters catalog (and optional Supabase).
 * Run before flipping WATCHLIST_SOURCE=catalog or deleting Fontes tabs.
 *
 *   cd pipeline && npx tsx scripts/diff-watchlist-sources.ts
 */

import {
  readWatchlistFromCatalogSheets,
  readWatchlistFromFontesSheets,
} from '../sinks/sheets-writer'
import { readWatchlistFromSupabase, catalogHasSupabaseRows } from '../sinks/catalog-store'

function setOf(entries: Array<{ handle: string; active: boolean }>, activeOnly: boolean) {
  return new Set(
    entries.filter((e) => !activeOnly || e.active).map((e) => e.handle.toLowerCase())
  )
}

function diff(a: Set<string>, b: Set<string>): { onlyA: string[]; onlyB: string[] } {
  const onlyA = [...a].filter((h) => !b.has(h)).sort()
  const onlyB = [...b].filter((h) => !a.has(h)).sort()
  return { onlyA, onlyB }
}

async function main() {
  const fontes = await readWatchlistFromFontesSheets()
  const catalog = await readWatchlistFromCatalogSheets()
  const fontesAll = setOf(fontes, false)
  const fontesActive = setOf(fontes, true)
  const catalogAll = setOf(catalog, false)
  const catalogActive = setOf(catalog, true)

  console.log('=== Watchlist source diff ===')
  console.log(`Fontes total/active:  ${fontesAll.size} / ${fontesActive.size}`)
  console.log(`Catalog total/active: ${catalogAll.size} / ${catalogActive.size}`)

  const allDiff = diff(fontesAll, catalogAll)
  const activeDiff = diff(fontesActive, catalogActive)

  console.log('\n--- Handles in Fontes but NOT in Venues/Promoters catalog ---')
  console.log(allDiff.onlyA.length ? allDiff.onlyA.join('\n') : '(none)')

  console.log('\n--- Handles in catalog but NOT in Fontes ---')
  console.log(allDiff.onlyB.length ? allDiff.onlyB.join('\n') : '(none)')

  console.log('\n--- Active in Fontes but missing/inactive in catalog ---')
  const catalogActiveOrPresent = catalogActive
  const missingActive = [...fontesActive].filter((h) => !catalogActiveOrPresent.has(h)).sort()
  console.log(missingActive.length ? missingActive.join('\n') : '(none)')

  console.log('\n--- Active diff (Fontes active vs catalog active) ---')
  console.log('only Fontes active:', activeDiff.onlyA.length)
  console.log('only catalog active:', activeDiff.onlyB.length)

  if (await catalogHasSupabaseRows()) {
    const sb = await readWatchlistFromSupabase()
    const sbActive = setOf(sb, true)
    const vsSb = diff(catalogActive, sbActive)
    console.log(`\nSupabase watchlist total/active: ${sb.length} / ${sbActive.size}`)
    console.log('catalog active missing in Supabase:', vsSb.onlyA.length)
    console.log('Supabase active missing in catalog sheets:', vsSb.onlyB.length)
  } else {
    console.log('\nSupabase venues/promoters: empty or not configured')
  }

  const ok = missingActive.length === 0
  console.log(
    `\nCutover ready for WATCHLIST_SOURCE=catalog: ${ok ? 'YES' : 'NO — backfill missing active handles into Venues/Promoters first'}`
  )
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
