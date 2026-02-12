#!/usr/bin/env node
/**
 * Sanity-check: prints ingestion stats from the loaders.
 * Requires dev server: npm run dev
 * Then: node scripts/sanity-check.mjs
 *
 * Or set BASE_URL for production: BASE_URL=https://yoursite.com node scripts/sanity-check.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

async function main() {
  try {
    const res = await fetch(`${BASE_URL}/api/sanity-check`, { cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    const data = await res.json()

    if (data.error) {
      console.error('Error:', data.error)
      process.exit(1)
    }

    const { stats, quarantinedByReason } = data

    console.log('--- Ingestion Sanity Check ---')
    console.log(`Total rows:      ${stats.totalRows}`)
    console.log(`Loaded:          ${stats.loaded}`)
    console.log(`Listing count:   ${stats.listingCount ?? stats.loaded}`)
    console.log(`Quarantined:     ${stats.quarantined}`)
    console.log(`Duplicates merged: ${stats.duplicatesMerged}`)
    console.log(`Unknown venues:  ${stats.unknownVenues}`)
    console.log('')
    console.log('Quarantined by reason:')
    const reasons = Object.entries(quarantinedByReason || {})
    if (reasons.length === 0) {
      console.log('  (none)')
    } else {
      for (const [reason, count] of reasons) {
        if (count > 0) {
          console.log(`  ${reason}: ${count}`)
        }
      }
    }
    console.log('---')
  } catch (err) {
    console.error('Failed:', err.message)
    if (BASE_URL.includes('localhost')) {
      console.error('Hint: Start the dev server first: npm run dev')
    }
    process.exit(1)
  }
}

main()
