/**
 * Apify orchestration — dedicated Instagram Post + Profile scrapers.
 * Posts: apify/instagram-post-scraper (nH2AHrwxeTRJoN5hX)
 * Profiles: apify/instagram-profile-scraper (dSCLg0C3YEZ83HzYX)
 */

import { ApifyClient } from 'apify-client'
import { getConfig, requireConfig } from '../config'

export interface InstagramScrapeOptions {
  handles: string[]
  /** ISO date — only fetch posts newer than this */
  onlyPostsNewerThan?: string
  resultsLimitPerAccount?: number
}

export interface ApifyRunResult {
  apifyRunId: string
  items: ApifyInstagramItem[]
}

/** Loosely-typed Apify Instagram post item (fields we consume). */
export interface ApifyInstagramItem {
  id?: string
  type?: string
  shortCode?: string
  caption?: string
  url?: string
  displayUrl?: string
  videoUrl?: string
  images?: string[]
  childPosts?: { displayUrl?: string; videoUrl?: string; type?: string }[]
  hashtags?: string[]
  mentions?: string[]
  timestamp?: string
  likesCount?: number
  commentsCount?: number
  ownerUsername?: string
  ownerFullName?: string
  ownerId?: string
  /** Present on some post items / parent data */
  ownerProfilePicUrl?: string
  locationName?: string
  locationId?: string
  latestComments?: unknown[]
  inputUrl?: string
  isSponsored?: boolean
  productType?: string
  [key: string]: unknown
}

/** Profile item from apify/instagram-profile-scraper. */
export interface ApifyInstagramProfile {
  username?: string
  fullName?: string
  url?: string
  profilePicUrl?: string
  profilePicUrlHD?: string
  biography?: string
  followersCount?: number
  [key: string]: unknown
}

let client: ApifyClient | null = null

function getClient(): ApifyClient {
  if (!client) {
    client = new ApifyClient({ token: requireConfig('APIFY_API_TOKEN', 'Apify scraping') })
  }
  return client
}

function postActorId(): string {
  const cfg = getConfig()
  return cfg.APIFY_INSTAGRAM_POST_ACTOR_ID || cfg.APIFY_INSTAGRAM_ACTOR_ID || 'nH2AHrwxeTRJoN5hX'
}

function profileActorId(): string {
  return getConfig().APIFY_INSTAGRAM_PROFILE_ACTOR_ID || 'dSCLg0C3YEZ83HzYX'
}

/**
 * Apify onlyPostsNewerThan accepts ISO-8601 ending in optional Z, or relative strings
 * like "14 days". Postgres often returns "+00:00" which Apify rejects — normalize to Z.
 */
export function toApifyOnlyPostsNewerThan(value: string): string {
  const trimmed = value.trim()
  if (/^\d+\s*(minute|hour|day|week|month|year)s?$/i.test(trimmed)) return trimmed
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return trimmed
  return new Date(ms).toISOString()
}

/** Input for apify/instagram-post-scraper (`username` array, not directUrls). */
export function buildInstagramApifyInput(options: InstagramScrapeOptions): Record<string, unknown> {
  const cfg = getConfig()
  const uniqueHandles = [
    ...new Set(options.handles.map((h) => h.replace(/^@/, '').toLowerCase()).filter(Boolean)),
  ]
  const input: Record<string, unknown> = {
    username: uniqueHandles,
    resultsLimit: options.resultsLimitPerAccount ?? cfg.PIPELINE_MAX_POSTS_PER_ACCOUNT,
    skipPinnedPosts: false,
  }
  if (options.onlyPostsNewerThan) {
    input.onlyPostsNewerThan = toApifyOnlyPostsNewerThan(options.onlyPostsNewerThan)
  }
  return input
}

async function runActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<ApifyRunResult> {
  const run = await getClient().actor(actorId).call(input, {
    waitSecs: 15 * 60,
  })
  const { items } = await getClient().dataset(run.defaultDatasetId).listItems()
  return { apifyRunId: run.id, items: items as ApifyInstagramItem[] }
}

/**
 * Scrape posts for the given handles. Batch mode = one actor run for all handles;
 * per_account mode = one run per handle (isolates failures, easier recovery).
 */
export async function scrapeInstagram(options: InstagramScrapeOptions): Promise<ApifyRunResult[]> {
  const cfg = getConfig()
  const actorId = postActorId()
  if (cfg.PIPELINE_RUN_MODE === 'per_account') {
    const results: ApifyRunResult[] = []
    for (const handle of options.handles) {
      try {
        results.push(
          await runActor(actorId, buildInstagramApifyInput({ ...options, handles: [handle] }))
        )
      } catch (err) {
        console.error(`[apify] per_account run failed for @${handle}:`, err instanceof Error ? err.message : err)
      }
    }
    return results
  }
  return [await runActor(actorId, buildInstagramApifyInput(options))]
}

/**
 * Fetch Instagram profile metadata (incl. profile pic) via dedicated profile scraper.
 * One actor run for all handles (cheap vs posts scrape).
 */
export async function scrapeInstagramProfiles(handles: string[]): Promise<ApifyInstagramProfile[]> {
  const unique = [...new Set(handles.map((h) => h.replace(/^@/, '').toLowerCase()).filter(Boolean))]
  if (unique.length === 0) return []

  const input: Record<string, unknown> = {
    usernames: unique,
  }
  const { items } = await runActor(profileActorId(), input)
  return items as ApifyInstagramProfile[]
}

export function profilePicFromApifyProfile(p: ApifyInstagramProfile): string {
  const hd = typeof p.profilePicUrlHD === 'string' ? p.profilePicUrlHD.trim() : ''
  const std = typeof p.profilePicUrl === 'string' ? p.profilePicUrl.trim() : ''
  // Some profile-scraper payloads use snake_case
  const hdSnake =
    typeof (p as { profile_pic_url_hd?: unknown }).profile_pic_url_hd === 'string'
      ? String((p as { profile_pic_url_hd: string }).profile_pic_url_hd).trim()
      : ''
  const stdSnake =
    typeof (p as { profile_pic_url?: unknown }).profile_pic_url === 'string'
      ? String((p as { profile_pic_url: string }).profile_pic_url).trim()
      : ''
  return hd || hdSnake || std || stdSnake
}

export function usernameFromApifyProfile(p: ApifyInstagramProfile): string {
  const u = typeof p.username === 'string' ? p.username : ''
  if (u) return u.replace(/^@/, '').toLowerCase()
  const url = typeof p.url === 'string' ? p.url : typeof p.inputUrl === 'string' ? p.inputUrl : ''
  const m = url.match(/instagram\.com\/([^/?#]+)/i)
  return m ? m[1].toLowerCase() : ''
}
