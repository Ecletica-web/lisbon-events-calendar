/**
 * Transform a raw Apify instagram-scraper item into a canonical Events_Raw row.
 * Normalize once, keep full traceability via raw_json.
 */

import type { ApifyInstagramItem } from './apify-client'
import type { EventsRawRow, MediaType } from '../types'

function detectMediaType(item: ApifyInstagramItem): MediaType {
  const type = (item.type ?? '').toLowerCase()
  if (type === 'sidecar' || (item.childPosts?.length ?? 0) > 0) return 'carousel'
  if (type === 'video' || item.videoUrl) return 'video'
  if (type === 'image' || item.displayUrl) return 'image'
  return 'unknown'
}

/** Slide URLs for carousels, in order. */
export function extractCarouselSlideUrls(item: ApifyInstagramItem): string[] {
  const fromChildren = (item.childPosts ?? [])
    .map((c) => c.displayUrl ?? '')
    .filter(Boolean)
  if (fromChildren.length > 0) return fromChildren
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
  }
  return []
}

export function transformInstagramApifyPost(
  item: ApifyInstagramItem,
  runId: string
): EventsRawRow | null {
  const postId = String(item.id ?? item.shortCode ?? '')
  if (!postId) return null

  const mediaType = detectMediaType(item)
  const slideUrls = mediaType === 'carousel' ? extractCarouselSlideUrls(item) : []
  const permalink = item.url ?? (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : '')
  const now = new Date().toISOString()

  const externalLinks: string[] = []
  const caption = item.caption ?? ''
  for (const match of caption.matchAll(/https?:\/\/[^\s)\]}"']+/g)) {
    externalLinks.push(match[0])
  }

  return {
    id: postId,
    source_name: 'instagram',
    source_event_id: postId,
    source_url: permalink,
    owner_username: item.ownerUsername ?? '',
    owner_id: String(item.ownerId ?? ''),
    owner_full_name: item.ownerFullName ?? '',
    caption,
    posted_at: item.timestamp ?? '',
    scraped_at: now,
    run_id: runId,
    location_id: String(item.locationId ?? ''),
    location_name: item.locationName ?? '',
    location_address: '',
    latitude: '',
    longitude: '',
    media_type: mediaType,
    media_urls: [item.displayUrl, item.videoUrl, ...slideUrls].filter(Boolean).join('|'),
    thumbnail_url: item.displayUrl ?? '',
    permalink,
    hashtags: (item.hashtags ?? []).join('|'),
    mentions: (item.mentions ?? []).join('|'),
    external_links: externalLinks.join('|'),
    like_count: item.likesCount != null ? String(item.likesCount) : '',
    comment_count: item.commentsCount != null ? String(item.commentsCount) : '',
    stored_image_url: '',
    image_status: 'pending',
    image_storage_path: '',
    image_error: '',
    shortCode: item.shortCode ?? '',
    displayUrl: item.displayUrl ?? '',
    carousel_slide_urls: slideUrls.join('|'),
    archived_slide_urls: '',
    video_url: item.videoUrl ?? '',
    raw_json: JSON.stringify(item),
    created_at: now,
    updated_at: now,
  }
}
