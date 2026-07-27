/**
 * Seed Supabase venues + promoters from Google Sheets catalog tabs (or published CSV).
 *
 *   cd pipeline && npx tsx scripts/seed-catalog-from-sheets.ts
 *   cd pipeline && npx tsx scripts/seed-catalog-from-sheets.ts --dry-run
 *
 * Requires: migration 025, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, Sheets/CSV access.
 */

import Papa from 'papaparse'
import { getConfig } from '../config'
import { normalizeIgHandle, parseIsActive, slugifyName } from '../sinks/fontes-ig'
import { readTabSafe, TAB_VENUES, TAB_PROMOTERS } from '../sinks/sheets-writer'
import { getSupabaseStore, isSupabaseStoreConfigured } from '../sinks/supabase-store'

const dryRun = process.argv.includes('--dry-run')

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim()
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase())
    if (found && String(row[found] ?? '').trim()) return String(row[found]).trim()
  }
  return ''
}

function pipeList(raw: string): string[] {
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function loadCsv(url: string | undefined): Promise<Record<string, string>[]> {
  if (!url) return []
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return []
  let text = await res.text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data ?? []
}

async function main() {
  if (!isSupabaseStoreConfigured()) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  const cfg = getConfig()
  const sb = getSupabaseStore()

  let venueRows = await readTabSafe(TAB_VENUES)
  if (venueRows.length === 0) {
    venueRows = await loadCsv(cfg.NEXT_PUBLIC_VENUES_CSV_URL)
  }
  let promoterRows = await readTabSafe(TAB_PROMOTERS)
  if (promoterRows.length === 0) {
    const url = process.env.NEXT_PUBLIC_PROMOTERS_CSV_URL
    promoterRows = await loadCsv(url)
  }

  console.log(`Venues rows: ${venueRows.length}, Promoters rows: ${promoterRows.length}`)
  if (dryRun) console.log('(dry-run — no writes)')

  let venuesUpserted = 0
  let promotersUpserted = 0
  let skipped = 0

  for (const row of venueRows) {
    const name = pick(row, 'name', 'Name', 'venue_name')
    if (!name) {
      skipped++
      continue
    }
    const venue_id = pick(row, 'venue_id') || slugifyName(name)
    const handle = normalizeIgHandle(pick(row, 'instagram_handle', 'instagram'))
    const payload = {
      venue_id,
      name,
      slug: pick(row, 'slug') || slugifyName(name) || venue_id,
      aliases: pipeList(pick(row, 'aliases')),
      instagram_handle: handle || null,
      primary_image_url: pick(row, 'primary_image_url') || null,
      description_short: pick(row, 'description_short') || null,
      website_url: pick(row, 'website_url', 'venue_url') || null,
      venue_tags: pipeList(pick(row, 'venue_tags', 'tags')),
      address: pick(row, 'address', 'venue_address') || null,
      city: pick(row, 'city') || null,
      neighborhood: pick(row, 'neighborhood') || null,
      region: pick(row, 'region') || null,
      country: pick(row, 'country') || null,
      postal_code: pick(row, 'postal_code') || null,
      latitude: parseFloat(pick(row, 'latitude', 'lat')) || null,
      longitude: parseFloat(pick(row, 'longitude', 'lng')) || null,
      venue_url: pick(row, 'venue_url') || null,
      instagram_url:
        pick(row, 'instagram_url') || (handle ? `https://www.instagram.com/${handle}/` : null),
      is_active: parseIsActive(pick(row, 'is_active', 'Active')),
      updated_at: new Date().toISOString(),
    }
    if (dryRun) {
      venuesUpserted++
      continue
    }
    const { error } = await sb.from('venues').upsert(payload, { onConflict: 'venue_id' })
    if (error) {
      console.warn(`venue ${venue_id}:`, error.message)
      skipped++
    } else {
      venuesUpserted++
    }
  }

  for (const row of promoterRows) {
    const name = pick(row, 'name', 'Name')
    if (!name) {
      skipped++
      continue
    }
    const promoter_id = pick(row, 'promoter_id') || slugifyName(name)
    const handle = normalizeIgHandle(pick(row, 'instagram_handle', 'instagram'))
    const payload = {
      promoter_id,
      name,
      slug: pick(row, 'slug') || slugifyName(name) || promoter_id,
      instagram_handle: handle || null,
      website_url: pick(row, 'website_url') || null,
      description_short: pick(row, 'description_short') || null,
      primary_image_url: pick(row, 'primary_image_url') || null,
      is_active: parseIsActive(pick(row, 'is_active', 'Active')),
      updated_at: new Date().toISOString(),
    }
    if (dryRun) {
      promotersUpserted++
      continue
    }
    const { error } = await sb.from('promoters').upsert(payload, { onConflict: 'promoter_id' })
    if (error) {
      console.warn(`promoter ${promoter_id}:`, error.message)
      skipped++
    } else {
      promotersUpserted++
    }
  }

  console.log({ venuesUpserted, promotersUpserted, skipped, dryRun })
  console.log(
    'Next: apply migration 025 if needed, verify row counts, set CATALOG_SOURCE=auto|supabase for the worker only after diff-watchlist-sources is green.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
