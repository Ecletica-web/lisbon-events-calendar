/**
 * Profile-image scraper — Instagram avatars for Fontes IG venues AND promoters.
 * Archives to Supabase venue-images + _index.json / venue_profile_images,
 * then writes Venues + Promoters sheet primary_image_url.
 *
 * Always pushes already-stored bucket images into Sheets first (so placeholders
 * get replaced even when a prior Sheets write failed).
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
  listStoredProfileImages,
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
  storagePushedToSheets: number
  errors: string[]
}

/** @deprecated alias */
export type SyncVenueImagesResult = SyncProfileImagesResult

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim()
}

async function pushUpdatesToSheets(
  venueUpdates: Array<{ handle: string; primaryImageUrl: string }>,
  promoterUpdates: Array<{ handle: string; primaryImageUrl: string }>,
  options: {
    dryRun?: boolean
    force?: boolean
    log: (line: string) => void | Promise<void>
    result: SyncProfileImagesResult
  }
): Promise<void> {
  const { dryRun, force, log, result } = options

  if (venueUpdates.length > 0) {
    try {
      const sheet = await updateSheetPrimaryImages(TAB_VENUES, venueUpdates, { dryRun, force })
      result.venuesSheetUpdated += sheet.updated
      result.venuesSheetSkipped += sheet.skipped
      await log(`[profile-images] Venues sheet updated=${sheet.updated} skipped=${sheet.skipped}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      await log(`[profile-images] Venues sheet update failed: ${msg}`)
    }
  }

  if (promoterUpdates.length > 0) {
    try {
      const sheet = await updateSheetPrimaryImages(TAB_PROMOTERS, promoterUpdates, { dryRun, force })
      result.promotersSheetUpdated += sheet.updated
      result.promotersSheetSkipped += sheet.skipped
      await log(
        `[profile-images] Promoters sheet updated=${sheet.updated} skipped=${sheet.skipped}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      await log(`[profile-images] Promoters sheet update failed: ${msg}`)
    }
  }
}

/**
 * Push already-archived Supabase images into Venues/Promoters sheets
 * (no Apify call). Use after Sheets API was fixed, or with --sheets-only.
 */
export async function pushStoredProfileImagesToSheets(options?: {
  dryRun?: boolean
  force?: boolean
  venueHandles?: Set<string>
  promoterHandles?: Set<string>
  log?: (line: string) => void | Promise<void>
}): Promise<SyncProfileImagesResult> {
  const log = options?.log ?? ((line: string) => console.log(line))
  const result: SyncProfileImagesResult = {
    profilesFetched: 0,
    archived: 0,
    supabaseUpserted: 0,
    venuesSheetUpdated: 0,
    venuesSheetSkipped: 0,
    promotersSheetUpdated: 0,
    promotersSheetSkipped: 0,
    storagePushedToSheets: 0,
    errors: [],
  }

  let stored
  try {
    stored = await listStoredProfileImages()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    await log(`[profile-images] list storage failed: ${msg}`)
    return result
  }

  await log(`[profile-images] found ${stored.length} archived image(s) in venue-images bucket`)
  if (stored.length === 0) return result

  const venueUpdates: Array<{ handle: string; primaryImageUrl: string }> = []
  const promoterUpdates: Array<{ handle: string; primaryImageUrl: string }> = []
  const seenVenue = new Set<string>()
  const seenPromoter = new Set<string>()

  for (const s of stored) {
    const handle = normalizeHandle(s.handle)
    const toVenue =
      s.kind === 'venue' ||
      (s.kind === 'profile' && (options?.venueHandles?.has(handle) ?? true))
    const toPromoter =
      s.kind === 'promoter' ||
      (s.kind === 'profile' && (options?.promoterHandles?.has(handle) ?? false))

    if (toVenue && !seenVenue.has(handle)) {
      seenVenue.add(handle)
      venueUpdates.push({ handle, primaryImageUrl: s.primaryImageUrl })
    }
    if (toPromoter && !seenPromoter.has(handle)) {
      seenPromoter.add(handle)
      promoterUpdates.push({ handle, primaryImageUrl: s.primaryImageUrl })
    }
  }

  result.storagePushedToSheets = venueUpdates.length + promoterUpdates.length
  await log(
    `[profile-images] pushing storage → Sheets: ${venueUpdates.length} venue(s), ${promoterUpdates.length} promoter(s)`
  )

  try {
    const n = await upsertVenueProfileImages(
      [...venueUpdates, ...promoterUpdates],
      options?.dryRun
    )
    result.supabaseUpserted += n
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    await log(`[profile-images] Supabase upsert failed: ${msg}`)
  }

  await pushUpdatesToSheets(venueUpdates, promoterUpdates, {
    dryRun: options?.dryRun,
    force: options?.force,
    log,
    result,
  })

  return result
}

/**
 * Active venue + promoter handles from Fontes IG → Apify profiles → archive →
 * Supabase index → Venues/Promoters sheets.
 */
export async function syncProfileImages(
  watchlist: WatchlistEntry[],
  options?: {
    dryRun?: boolean
    force?: boolean
    /** Skip Apify; only push existing bucket images into Sheets */
    sheetsOnly?: boolean
    log?: (line: string) => void | Promise<void>
  }
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
    storagePushedToSheets: 0,
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
  const venueSet = new Set(venueHandles)
  const promoterSet = new Set(promoterHandles)

  // Always repair Sheets from what's already in Supabase (fixes the "lost" gap)
  const push = await pushStoredProfileImagesToSheets({
    dryRun: options?.dryRun,
    force: options?.force,
    venueHandles: venueSet,
    promoterHandles: promoterSet,
    log,
  })
  result.storagePushedToSheets = push.storagePushedToSheets
  result.venuesSheetUpdated += push.venuesSheetUpdated
  result.venuesSheetSkipped += push.venuesSheetSkipped
  result.promotersSheetUpdated += push.promotersSheetUpdated
  result.promotersSheetSkipped += push.promotersSheetSkipped
  result.supabaseUpserted += push.supabaseUpserted
  result.errors.push(...push.errors)

  if (options?.sheetsOnly) {
    await log('[profile-images] sheets-only — skipping Apify')
    return result
  }

  const allHandles = [...new Set([...venueHandles, ...promoterHandles])]
  if (allHandles.length === 0) {
    await log('[profile-images] no active venue/promoter handles in Fontes IG — skip Apify')
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
    await log(`[profile-images] Apify profile scrape failed: ${msg}`)
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

  await pushUpdatesToSheets(venueUpdates, promoterUpdates, {
    dryRun: options?.dryRun,
    force: options?.force,
    log,
    result,
  })

  return result
}

/** @deprecated use syncProfileImages */
export const syncVenueProfileImages = syncProfileImages
