/**
 * Embed carousel resolver — fallback when Apify does not return carousel slide URLs.
 * Fetches instagram.com/p/{shortcode}/embed/ and parses CDN image URLs out of the HTML.
 * Best-effort: returns [] when the embed page is unavailable or contains no slides.
 */

import { getConfig } from '../config'

const EMBED_TIMEOUT_MS = 15000

function decodeEntities(url: string): string {
  return url
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/')
}

/** Extract IG CDN image URLs from embed HTML (both <img> tags and inline JSON blobs). */
export function parseSlideUrlsFromEmbedHtml(html: string): string[] {
  const urls = new Set<string>()

  // Inline JSON: "display_url":"https:\/\/scontent..." (carousel media nodes)
  for (const m of html.matchAll(/"display_url"\s*:\s*"((?:https?:)?\\?\/\\?\/[^"]+)"/g)) {
    urls.add(decodeEntities(m[1]))
  }
  // <img> tags pointing at the CDN
  for (const m of html.matchAll(/<img[^>]+src="(https:\/\/(?:scontent|instagram)[^"]+)"/g)) {
    const url = decodeEntities(m[1])
    // Skip avatars / tiny profile pictures
    if (!/profile_pic|s150x150|s320x320/.test(url)) urls.add(url)
  }

  return Array.from(urls)
}

export async function resolveCarouselSlidesViaEmbed(shortcode: string): Promise<string[]> {
  const cfg = getConfig()
  if (!cfg.INSTAGRAM_EMBED_CAROUSEL_FETCH) return []
  if (!shortcode) return []

  const url = `https://www.instagram.com/p/${shortcode}/embed/captioned/`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return []
    const html = await res.text()
    return parseSlideUrlsFromEmbedHtml(html)
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}
