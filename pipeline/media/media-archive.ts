/**
 * Media archive — persists ephemeral IG CDN URLs to permanent Supabase storage
 * via the app's existing POST /api/admin/events/persist-image bridge.
 */

import { getConfig, requireConfig } from '../config'

export interface ArchiveResult {
  url: string
  path: string
  bucket?: string
}

export type ArchiveBucket = 'event-images' | 'venue-images'

/** Archive one remote image; returns null on failure (caller decides how to degrade). */
export async function archiveImage(
  imageUrl: string,
  eventId: string,
  options?: { bucket?: ArchiveBucket }
): Promise<ArchiveResult | null> {
  const cfg = getConfig()
  const apiKey = requireConfig('EVENT_IMPORT_API_KEY', 'media archive (persist-image)')
  const endpoint = `${cfg.APP_BASE_URL.replace(/\/$/, '')}/api/admin/events/persist-image`
  const bucket = options?.bucket ?? 'event-images'

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ imageUrl, eventId, bucket }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `[media-archive] persist-image failed (${res.status}) for ${eventId}: ${body.slice(0, 200)}`
      )
      return null
    }
    const data = (await res.json()) as ArchiveResult
    return data
  } catch (err) {
    console.error(`[media-archive] error for ${eventId}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** Archive all carousel slides for a post; returns archived URLs aligned with input order ('' on failure). */
export async function archiveSlides(slideUrls: string[], postId: string): Promise<string[]> {
  const archived: string[] = []
  for (let i = 0; i < slideUrls.length; i++) {
    const result = await archiveImage(slideUrls[i], `${postId}_s${i + 1}`)
    archived.push(result?.url ?? '')
  }
  return archived
}

/** Fetch an image (archived or CDN) as base64 for multimodal calls. */
export async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mime: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LisbonEventsPipeline/1.0' } })
    if (!res.ok) return null
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    const buffer = Buffer.from(await res.arrayBuffer())
    // Guard against pathological payloads (vision providers cap request size)
    if (buffer.byteLength > 8 * 1024 * 1024) return null
    return { base64: buffer.toString('base64'), mime }
  } catch {
    return null
  }
}
