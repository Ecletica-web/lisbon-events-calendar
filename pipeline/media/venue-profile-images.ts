/**
 * Profile-image scraper — Instagram avatars for Fontes IG venues AND promoters.
 * Archives to Supabase venue-images + _index.json / venue_profile_images,
 * then best-effort writes Venues + Promoters sheet primary_image_url.
 */

import { getConfig } from '../config'
import { archiveImage } from './media-archive'
import {
  profilePicFromApifyProfile,
  scrapeInstagramProfiles,
  usernameFromApifyProfile,
} from '../scrapers/apify-client'
import {
  TAB_PROMOTERS,
  TAB_VENUES,
  updateSheetPrimaryImages,
} from '../sinks/sheets-writer'
import {
  backfillVenueProfileImagesFromStorage,
  upsertVenueProfileImages,
} from '../sinks/supabase-store'
import type { WatchlistEntry } from '../types'

export interface SyncProfileImagesResult {
  profilesFetched: number
  archived: number
  supabaseUpserted: number
  venuesSheetUpdated: number
  venuesSheetSkipped: number
  promotersSheetUpdated: number
  promotersSheetSkipped: number
  errors: string[]
}

/** @deprecated alias */
export type SyncVenueImagesResult = SyncProfileImagesResult

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim()
}

/**
 * Active venue + promoter handles from Fontes IG → Apify profiles → archive →
 * Supabase index → Venues/Promoters sheets.
 */
export async function syncProfileImages(
  watchlist: WatchlistEntry[],
  options?: { dryRun?: boolean; force?: boolean; log?: (line: string) => void | Promise<void> }
): Promise<SyncProfileImagesResult> {
  const log = options?.log ?? ((line: string) => console.log(line))
  const result: SyncProfileImagesResult = {
    profilesFetched: 0,
    archived: 0,
    supabaseUpserted: 0,
    venuesSheetUpdated: 0,
    venuesSheetSkipped: 0,
    promotersSheetUpdated: 0,
    promotersSheetSkipped: 0,
    errors: [],
  }

  try {
    const seeded = await backfillVenueProfileImagesFromStorage()
    if (seeded > 0) {
      result.supabaseUpserted += seeded
      await log(`[profile-images] seeded ${seeded} URL(s) from storage → index`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`storage backfill: ${msg}`)
    await log(`[profile-images] storage backfill skipped: ${msg}`)
  }

  const venueHandles = [
    ...new Set(
      watchlist
        .filter((w) => w.active && w.type === 'venue')
        .map((w) => normalizeHandle(w.handle))
        .filter(Boolean)
    ),
  ]
  const promoterHandles = [
    ...new Set(
      watchlist
        .filter((w) => w.active && w.type === 'promoter')
        .map((w) => normalizeHandle(w.handle))
        .filter(Boolean)
    ),
  ]
  const allHandles = [...new Set([...venueHandles, ...promoterHandles])]
  const venueSet = new Set(venueHandles)
  const promoterSet = new Set(promoterHandles)

  if (allHandles.length === 0) {
    await log('[profile-images] no active venue/promoter handles in Fontes IG — skip')
    return result
  }

  await log(
    `[profile-images] fetching Instagram profiles for ${venueHandles.length} venue(s) + ${promoterHandles.length} promoter(s)…`
  )

  let profiles
  try {
    profiles = await scrapeInstagramProfiles(allHandles)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    await log(`[profile-images] Apify details failed: ${msg}`)
    return result
  }

  result.profilesFetched = profiles.length
  await log(`[profile-images] Apify returned ${profiles.length} profile(s)`)

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

    const kind = promoterSet.has(handle)
      ? 'promoter'
      : venueSet.has(handle)
        ? 'venue'
        : 'profile'
    const archiveId = `${kind}_${handle}`

    if (options?.dryRun || !cfg.EVENT_IMPORT_API_KEY) {
      await log(`[profile-images] dry-run / no EVENT_IMPORT_API_KEY: would archive @${handle}`)
      updates.push({ handle, primaryImageUrl: picUrl })
      continue
    }

    const archived = await archiveImage(picUrl, archiveId, { bucket: 'venue-images' })
    if (!archived?.url) {
      result.errors.push(`archive failed for @${handle}`)
      await log(`[profile-images] archive failed for @${handle}`)
      continue
    }
    result.archived++
    updates.push({ handle, primaryImageUrl: archived.url })
    await log(`[profile-images] archived @${handle} (${kind}) → ${archived.url}`)
  }

  if (missingPic > 0) {
    await log(`[profile-images] ${missingPic} profile(s) missing username or profile pic URL`)
  }

  if (updates.length === 0) return result

  try {
    const n = await upsertVenueProfileImages(updates, options?.dryRun)
    result.supabaseUpserted += n
    await log(`[profile-images] supabase index upserted=${n}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    await log(`[profile-images] Supabase upsert failed: ${msg}`)
  }

  const venueUpdates = updates.filter((u) => venueSet.has(normalizeHandle(u.handle)))
  const promoterUpdates = updates.filter((u) => promoterSet.has(normalizeHandle(u.handle)))

  if (venueUpdates.length > 0) {
    try {
      const sheet = await updateSheetPrimaryImages(TAB_VENUES, venueUpdates, {
        dryRun: options?.dryRun,
        force: options?.force,
      })
      result.venuesSheetUpdated = sheet.updated
      result.venuesSheetSkipped = sheet.skipped
      await log(
        `[profile-images] Venues sheet updated=${sheet.updated} skipped=${sheet.skipped}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      await log(`[profile-images] Venues sheet update failed: ${msg}`)
    }
  }

  if (promoterUpdates.length > 0) {
    try {
      const sheet = await updateSheetPrimaryImages(TAB_PROMOTERS, promoterUpdates, {
        dryRun: options?.dryRun,
        force: options?.force,
      })
      result.promotersSheetUpdated = sheet.updated
      result.promotersSheetSkipped = sheet.skipped
      await log(
        `[profile-images] Promoters sheet updated=${sheet.updated} skipped=${sheet.skipped}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      await log(`[profile-images] Promoters sheet update failed: ${msg}`)
    }
  }

  return result
}

/** @deprecated use syncProfileImages */
export const syncVenueProfileImages = syncProfileImages
