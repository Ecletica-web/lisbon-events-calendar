/**
 * Apify orchestration for the Instagram scraper actor (apify/instagram-scraper).
 * Supports batch (all handles in one run) and per_account modes.
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

/** Loosely-typed Apify instagram-scraper dataset item (fields we consume). */
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
  locationName?: string
  locationId?: string
  latestComments?: unknown[]
  inputUrl?: string
  isSponsored?: boolean
  productType?: string
  [key: string]: unknown
}

let client: ApifyClient | null = null

function getClient(): ApifyClient {
  if (!client) {
    client = new ApifyClient({ token: requireConfig('APIFY_API_TOKEN', 'Apify scraping') })
  }
  return client
}

export function buildInstagramApifyInput(options: InstagramScrapeOptions): Record<string, unknown> {
  const cfg = getConfig()
  const input: Record<string, unknown> = {
    directUrls: options.handles.map((h) => `https://www.instagram.com/${h.replace(/^@/, '')}/`),
    resultsType: 'posts',
    resultsLimit: options.resultsLimitPerAccount ?? cfg.PIPELINE_MAX_POSTS_PER_ACCOUNT,
    addParentData: false,
    proxy: { useApifyProxy: true },
  }
  if (options.onlyPostsNewerThan) {
    input.onlyPostsNewerThan = options.onlyPostsNewerThan
  }
  return input
}

async function runActor(input: Record<string, unknown>): Promise<ApifyRunResult> {
  const cfg = getConfig()
  const run = await getClient().actor(cfg.APIFY_INSTAGRAM_ACTOR_ID).call(input, {
    waitSecs: 15 * 60,
  })
  const { items } = await getClient().dataset(run.defaultDatasetId).listItems()
  return { apifyRunId: run.id, items: items as ApifyInstagramItem[] }
}

/**
 * Scrape the given handles. Batch mode = one actor run for all handles;
 * per_account mode = one run per handle (isolates failures, easier recovery).
 */
export async function scrapeInstagram(options: InstagramScrapeOptions): Promise<ApifyRunResult[]> {
  const cfg = getConfig()
  if (cfg.PIPELINE_RUN_MODE === 'per_account') {
    const results: ApifyRunResult[] = []
    for (const handle of options.handles) {
      try {
        results.push(await runActor(buildInstagramApifyInput({ ...options, handles: [handle] })))
      } catch (err) {
        console.error(`[apify] per_account run failed for @${handle}:`, err instanceof Error ? err.message : err)
      }
    }
    return results
  }
  return [await runActor(buildInstagramApifyInput(options))]
}
