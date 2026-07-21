/**
 * Instagram profile pics archived by the pipeline.
 * Sources (first hit wins):
 *  1. venue_profile_images table (migration 021)
 *  2. public venue-images/_index.json (written by pipeline; works without migration)
 */

import { supabaseServer } from '@/lib/supabase/server'

function normalizeIgHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim().split(/[/?#]/)[0]
}

function needsImageFallback(url: string | undefined | null): boolean {
  const u = (url || '').trim()
  if (!u) return true
  if (/^\/lisboa\.png$/i.test(u)) return true
  if (/placeholder|picsum\.photos|placehold\.it|via\.placeholder/i.test(u)) return true
  return false
}

function supabasePublicBase(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
}

async function loadFromIndexJson(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const base = supabasePublicBase()
  if (!base) return map
  try {
    const res = await fetch(`${base}/storage/v1/object/public/venue-images/_index.json`, {
      cache: 'no-store',
    })
    if (!res.ok) return map
    const json = (await res.json()) as Record<string, string>
    for (const [handle, url] of Object.entries(json || {})) {
      const h = normalizeIgHandle(handle)
      const u = String(url || '').trim()
      if (h && u) map.set(h, u)
    }
  } catch (err) {
    console.warn('[venueProfileImages] _index.json', err)
  }
  return map
}

/** Map instagram_handle → public primary_image_url. */
export async function loadVenueProfileImageMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  if (supabaseServer) {
    const { data, error } = await supabaseServer
      .from('venue_profile_images')
      .select('instagram_handle, primary_image_url')

    if (!error && data) {
      for (const row of data) {
        const handle = normalizeIgHandle(String(row.instagram_handle || ''))
        const url = String(row.primary_image_url || '').trim()
        if (handle && url) map.set(handle, url)
      }
    } else if (error && !/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      console.warn('[venueProfileImages]', error.message)
    }
  }

  if (map.size === 0) {
    const fromJson = await loadFromIndexJson()
    for (const [k, v] of fromJson) map.set(k, v)
  }

  return map
}

export function mergeVenueProfileImages<
  T extends { instagram_handle?: string; primary_image_url?: string },
>(venues: T[], imageByHandle: Map<string, string>): T[] {
  if (imageByHandle.size === 0) return venues
  return venues.map((v) => {
    if (!needsImageFallback(v.primary_image_url)) return v
    const handle = normalizeIgHandle(v.instagram_handle || '')
    const url = handle ? imageByHandle.get(handle) : undefined
    if (!url) return v
    return { ...v, primary_image_url: url }
  })
}
