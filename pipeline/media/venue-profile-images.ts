/**
 * Sync Instagram profile pictures → Supabase venue-images → Venues.primary_image_url.
 * Runs as part of scrape setup for Fontes IG handles typed as venues.
 */

import { getConfig } from '../config'
import { archiveImage } from './media-archive'
import {
  profilePicFromApifyProfile,
  scrapeInstagramProfiles,
  usernameFromApifyProfile,
} from '../scrapers/apify-client'
import { updateVenuePrimaryImages } from '../sinks/sheets-writer'
import type { WatchlistEntry } from '../types'

export interface SyncVenueImagesResult {
  profilesFetched: number
  archived: number
  sheetUpdated: number
  sheetSkipped: number
  errors: string[]
}

/**
 * For venue-type watchlist handles: Apify profile details → archive to venue-images →
 * write public URL into Venues sheet primary_image_url.
 */
export async function syncVenueProfileImages(
  watchlist: WatchlistEntry[],
  options?: { dryRun?: boolean; force?: boolean; log?: (line: string) => void | Promise<void> }
): Promise<SyncVenueImagesResult> {
  const log = options?.log ?? ((line: string) => console.log(line))
  const result: SyncVenueImagesResult = {
    profilesFetched: 0,
    archived: 0,
    sheetUpdated: 0,
    sheetSkipped: 0,
    errors: [],
  }

  const venueHandles = [
    ...new Set(
      watchlist
        .filter((w) => w.active && w.type === 'venue')
        .map((w) => w.handle.replace(/^@/, '').toLowerCase())
        .filter(Boolean)
    ),
  ]

  if (venueHandles.length === 0) {
    await log('[venue-images] no active venue handles in Fontes IG — skip')
    return result
  }

  await log(`[venue-images] fetching Instagram profiles for ${venueHandles.length} venue(s)…`)

  let profiles
  try {
    profiles = await scrapeInstagramProfiles(venueHandles)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    await log(`[venue-images] Apify details failed: ${msg}`)
    return result
  }

  result.profilesFetched = profiles.length
  await log(`[venue-images] Apify returned ${profiles.length} profile(s)`)

  const cfg = getConfig()
  const updates: Array<{ handle: string; primaryImageUrl: string }> = []

  for (const profile of profiles) {
    const handle = usernameFromApifyProfile(profile)
    const picUrl = profilePicFromApifyProfile(profile)
    if (!handle || !picUrl) {
      result.errors.push(`missing username/pic for profile ${JSON.stringify({ handle, picUrl })}`)
      continue
    }

    if (options?.dryRun || !cfg.EVENT_IMPORT_API_KEY) {
      await log(`[venue-images] dry-run / no EVENT_IMPORT_API_KEY: would archive @${handle}`)
      updates.push({ handle, primaryImageUrl: picUrl })
      continue
    }

    const archived = await archiveImage(picUrl, `venue_${handle}`, { bucket: 'venue-images' })
    if (!archived?.url) {
      result.errors.push(`archive failed for @${handle}`)
      await log(`[venue-images] archive failed for @${handle}`)
      continue
    }
    result.archived++
    updates.push({ handle, primaryImageUrl: archived.url })
    await log(`[venue-images] archived @${handle} → ${archived.url}`)
  }

  if (updates.length === 0) return result

  try {
    const sheet = await updateVenuePrimaryImages(updates, {
      dryRun: options?.dryRun,
      force: options?.force,
    })
    result.sheetUpdated = sheet.updated
    result.sheetSkipped = sheet.skipped
    await log(
      `[venue-images] Venues sheet updated=${sheet.updated} skipped=${sheet.skipped}`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    await log(`[venue-images] Sheets update failed: ${msg}`)
  }

  return result
}
