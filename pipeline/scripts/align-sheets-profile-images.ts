/**
 * Align Venues/Promoters sheets with Fontes IG + archived Supabase images.
 *
 * Root cause of placeholders sticking: Testing Venues tab uses demo IG handles
 * (@luxfrgilevents, …) that do not match Fontes IG / venue-images filenames
 * (luxfragil, …). Promoters tab is empty.
 *
 * This:
 * 1. Matches Venues rows → Fontes by normalized name (and handle when possible)
 * 2. Writes correct instagram_handle + primary_image_url from storage
 * 3. Appends missing Promoters rows from Fontes (with image when archived)
 *
 *   npx tsx scripts/align-sheets-profile-images.ts [--dry-run]
 */

import { getSheetsApi, getSpreadsheetId } from '../sinks/sheets-client'
import {
  TAB_PROMOTERS,
  TAB_VENUES,
  readTabSafe,
  readWatchlist,
} from '../sinks/sheets-writer'
import { listStoredProfileImages } from '../sinks/supabase-store'
import type { WatchlistEntry } from '../types'

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(s: string): string {
  return normName(s).replace(/\s+/g, '-') || 'unknown'
}

function fontesDisplayName(w: WatchlistEntry): string {
  const notes = (w.notes || '').split('·')[0]?.trim() || ''
  return notes || w.handle
}

function columnIndexToA1(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

async function batchUpdateCells(
  tab: string,
  cells: Array<{ row1Based: number; col0: number; value: string }>,
  dryRun: boolean
): Promise<number> {
  if (cells.length === 0) return 0
  if (dryRun) {
    console.log(`[dry-run] would update ${cells.length} cell(s) on ${tab}`)
    return cells.length
  }
  const api = getSheetsApi()
  const spreadsheetId = getSpreadsheetId()
  const data = cells.map((c) => ({
    range: `'${tab}'!${columnIndexToA1(c.col0)}${c.row1Based}`,
    values: [[c.value]],
  }))
  for (let i = 0; i < data.length; i += 100) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: data.slice(i, i + 100) },
    })
  }
  return cells.length
}

async function appendPromoterRows(
  rows: Record<string, string>[],
  dryRun: boolean
): Promise<number> {
  if (rows.length === 0) return 0
  if (dryRun) {
    console.log(`[dry-run] would append ${rows.length} promoter row(s)`)
    return rows.length
  }
  const header = [
    'promoter_id',
    'name',
    'slug',
    'instagram_handle',
    'website_url',
    'description_short',
    'primary_image_url',
    'tags',
    'is_active',
    'created_at',
    'updated_at',
  ]
  const api = getSheetsApi()
  const spreadsheetId = getSpreadsheetId()
  // Ensure header exists
  const existing = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TAB_PROMOTERS}'!A1:K1`,
  })
  if (!existing.data.values?.length) {
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `'${TAB_PROMOTERS}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    })
  }
  const values = rows.map((r) => header.map((h) => r[h] ?? ''))
  await api.spreadsheets.values.append({
    spreadsheetId,
    range: `'${TAB_PROMOTERS}'`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
  return rows.length
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const stored = await listStoredProfileImages()
  const byHandle = new Map(stored.map((s) => [s.handle, s.primaryImageUrl]))
  const watchlist = await readWatchlist()
  const venuesSheet = await readTabSafe(TAB_VENUES)

  const fontesVenues = watchlist.filter((w) => w.active && w.type === 'venue')
  const fontesPromoters = watchlist.filter((w) => w.active && w.type === 'promoter')

  // name → Fontes entry (first wins)
  const byName = new Map<string, WatchlistEntry>()
  for (const w of fontesVenues) {
    const n = normName(fontesDisplayName(w))
    if (n && !byName.has(n)) byName.set(n, w)
  }

  console.log({
    dryRun,
    storedImages: stored.length,
    sheetVenues: venuesSheet.length,
    fontesVenues: fontesVenues.length,
    fontesPromoters: fontesPromoters.length,
  })

  // Need column indexes from live header
  const { readTab } = await import('../sinks/sheets-client')
  const { header: venueHeader } = await readTab(TAB_VENUES)
  const handleCol = venueHeader.findIndex((h) => h.trim().toLowerCase() === 'instagram_handle')
  const imageCol = venueHeader.findIndex((h) => h.trim().toLowerCase() === 'primary_image_url')
  const nameCol = venueHeader.findIndex((h) => h.trim().toLowerCase() === 'name')
  if (handleCol < 0 || imageCol < 0 || nameCol < 0) {
    throw new Error('Venues tab missing name / instagram_handle / primary_image_url')
  }

  const cells: Array<{ row1Based: number; col0: number; value: string }> = []
  let matched = 0
  let withImage = 0
  const unmatched: string[] = []

  venuesSheet.forEach((row, i) => {
    const name = String(row.name || '')
    const n = normName(name)
    if (!n) {
      unmatched.push(name)
      return
    }

    let fontes = byName.get(n)
    if (!fontes) {
      // Loose match only when names clearly relate (avoid "Disaster" → "disaster.by.collect")
      let best: { w: WatchlistEntry; score: number } | null = null
      for (const [fn, w] of byName) {
        if (fn.length < 4 || n.length < 4) continue
        const shorter = fn.length <= n.length ? fn : n
        const longer = fn.length > n.length ? fn : n
        if (!longer.includes(shorter)) continue
        const score = shorter.length / longer.length
        if (score < 0.65) continue
        if (!best || score > best.score) best = { w, score }
      }
      fontes = best?.w
    }
    if (!fontes) {
      unmatched.push(name)
      return
    }
    matched++
    const handle = `@${fontes.handle}`
    const img = byHandle.get(fontes.handle) || ''
    cells.push({ row1Based: i + 2, col0: handleCol, value: handle })
    if (img) {
      cells.push({ row1Based: i + 2, col0: imageCol, value: img })
      withImage++
    }
    console.log(`  match: ${name} → ${handle}${img ? ' + image' : ''}`)
  })

  const venueCells = await batchUpdateCells(TAB_VENUES, cells, dryRun)
  console.log(`\nVenues: matched=${matched}/${venuesSheet.length} withImage=${withImage} cellsWritten=${venueCells}`)
  if (unmatched.length) console.log('Venues unmatched:', unmatched.join(', '))

  // Promoters: append from Fontes if sheet empty / missing handles
  const promotersSheet = await readTabSafe(TAB_PROMOTERS)
  const existingPromoterHandles = new Set(
    promotersSheet.map((r) =>
      String(r.instagram_handle || '')
        .replace(/^@/, '')
        .toLowerCase()
        .trim()
    )
  )
  const now = new Date().toISOString()
  const toAppend: Record<string, string>[] = []
  const seen = new Set<string>()
  for (const w of fontesPromoters) {
    if (seen.has(w.handle) || existingPromoterHandles.has(w.handle)) continue
    seen.add(w.handle)
    const name = fontesDisplayName(w)
    const slug = slugify(name)
    toAppend.push({
      promoter_id: `prm_${slug}`.slice(0, 40),
      name,
      slug,
      instagram_handle: `@${w.handle}`,
      website_url: `https://www.instagram.com/${w.handle}/`,
      description_short: '',
      primary_image_url: byHandle.get(w.handle) || '',
      tags: '',
      is_active: 'TRUE',
      created_at: now,
      updated_at: now,
    })
  }
  const appended = await appendPromoterRows(toAppend, dryRun)
  console.log(`Promoters: appended=${appended} (had ${promotersSheet.length} rows)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
