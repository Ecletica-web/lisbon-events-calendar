/**
 * Server-only catalog loaders (Venues + Promoters CSVs / Supabase).
 * Do not import from client components — use fetchVenues / fetchPromoters instead.
 */

import 'server-only'
import { loadVenues } from '@/data/loaders/venuesLoader'
import { loadPromoters } from '@/data/loaders/promotersLoader'
import { loadVenueTags } from '@/data/loaders/venueTagsLoader'
import { loadVenueProfileImageMap, mergeVenueProfileImages } from '@/lib/venueProfileImages'
import { loadCatalogVenues, loadCatalogPromoters, getCatalogSource } from '@/lib/adminCatalog'
import type { VenueForDisplay } from '@/lib/eventsAdapter'
import type { Promoter } from '@/models/Promoter'
import type { Venue } from '@/models/Venue'

function sanitizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (lower.includes('cdninstagram') || lower.includes('fbcdn.net')) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}`
  }
  return url
}

async function resolveVenuesList(allowedVenueTags: string[] | null): Promise<Venue[]> {
  const source = getCatalogSource()
  if (source !== 'sheets') {
    const fromSb = await loadCatalogVenues({ activeOnly: false })
    if (source === 'supabase' || fromSb.length > 0) return fromSb
  }
  const { venues } = await loadVenues(process.env.NEXT_PUBLIC_VENUES_CSV_URL, allowedVenueTags)
  return venues
}

async function resolvePromotersList(): Promise<Promoter[]> {
  const source = getCatalogSource()
  if (source !== 'sheets') {
    const fromSb = await loadCatalogPromoters({ activeOnly: true })
    if (source === 'supabase' || fromSb.length > 0) return fromSb
  }
  return loadPromoters(process.env.NEXT_PUBLIC_PROMOTERS_CSV_URL)
}

export async function loadVenuesForDisplay(): Promise<VenueForDisplay[]> {
  const venueTagsUrl = process.env.NEXT_PUBLIC_VENUE_TAGS_CSV_URL
  const venueTags = venueTagsUrl ? await loadVenueTags(venueTagsUrl) : []
  const allowedVenueTags = venueTags.length > 0 ? venueTags : null
  const [venues, imageByHandle] = await Promise.all([
    resolveVenuesList(allowedVenueTags),
    loadVenueProfileImageMap(),
  ])
  const withImages = mergeVenueProfileImages(venues, imageByHandle)
  return withImages.map((v) => ({
    venue_id: v.venue_id,
    name: v.name,
    slug: v.slug,
    neighborhood: v.neighborhood,
    venue_address: v.venue_address,
    description_short: v.description_short,
    primary_image_url: sanitizeImageUrl(v.primary_image_url),
    website_url: v.website_url,
    instagram_handle: v.instagram_handle,
    tags: v.tags,
    latitude: v.latitude,
    longitude: v.longitude,
  }))
}

export async function loadPromotersForDisplay(): Promise<Promoter[]> {
  const [promoters, imageByHandle] = await Promise.all([
    resolvePromotersList(),
    loadVenueProfileImageMap(),
  ])
  const withImages = mergeVenueProfileImages(promoters, imageByHandle)
  return withImages.map((p) => ({
    ...p,
    primary_image_url: sanitizeImageUrl(p.primary_image_url),
  }))
}
