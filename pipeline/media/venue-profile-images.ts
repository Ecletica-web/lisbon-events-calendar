/**
 * Sync Instagram profile pictures → Supabase venue-images + venue_profile_images
 * → (best-effort) Venues.primary_image_url in Google Sheets.
 *
 * /venues reads CSV first, then fills empty/placeholder images from venue_profile_images.
 */

import { getConfig } from '../config'
import { archiveImage } from './media-archive'
import {
  profilePicFromApifyProfile,
  scrapeInstagramProfiles,
  usernameFromApifyProfile,
} from '../scrapers/apify-client'
import { updateVenuePrimaryImages } from '../sinks/sheets-writer'
import {
  backfillVenueProfileImagesFromStorage,
  upsertVenueProfileImages,
} from '../sinks/supabase-store'
import type { WatchlistEntry } from '../types'

export interface SyncVenueImagesResult {
  profilesFetched: number
  archived: number
  supabaseUpserted: number
  sheetUpdated: number
  sheetSkipped: number
  errors: string[]
}

/**
 * For venue-type watchlist handles: Apify profile details → archive to venue-images →
 * upsert venue_profile_images → write public URL into Venues sheet (if Sheets API works).
 */
export async function syncVenueProfileImages(
  watchlist: WatchlistEntry[],
  options?: { dryRun?: boolean; force?: boolean; log?: (line: string) => void | Promise<void> }
): Promise<SyncVenueImagesResult> {
  const log = options?.log ?? ((line: string) => console.log(line))
  const result: SyncVenueImagesResult = {
    profilesFetched: 0,
    archived: 0,
    supabaseUpserted: 0,
    sheetUpdated: 0,
    sheetSkipped: 0,
    errors: [],
  }

  // Recover any images already in storage from prior runs where Sheets failed
  try {
    const seeded = await backfillVenueProfileImagesFromStorage()
    if (seeded > 0) {
      result.supabaseUpserted += seeded
      await log(`[venue-images] seeded ${seeded} URL(s) from venue-images bucket → venue_profile_images`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`storage backfill: ${msg}`)
    await log(`[venue-images] storage backfill skipped: ${msg}`)
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
  let missingPic = 0

  for (const profile of profiles) {
    const handle = usernameFromApifyProfile(profile)
    const picUrl = profilePicFromApifyProfile(profile)
    if (!handle || !picUrl) {
      missingPic++
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

  if (missingPic > 0) {
    await log(`[venue-images] ${missingPic} profile(s) missing username or profile pic URL`)
  }

  if (updates.length === 0) return result

  // Always persist to Supabase so /venues can merge images without Sheets
  try {
    const n = await upsertVenueProfileImages(updates, options?.dryRun)
    result.supabaseUpserted += n
    await log(`[venue-images] venue_profile_images upserted=${n}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    await log(`[venue-images] Supabase upsert failed: ${msg}`)
  }

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
    await log(
      `[venue-images] Sheets update failed (Supabase URLs still available for /venues): ${msg}`
    )
  }

  return result
}
