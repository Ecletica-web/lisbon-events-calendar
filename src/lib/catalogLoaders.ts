/**
 * Server-only catalog loaders (CSV + Fontes IG type split).
 * Do not import from client components — use fetchVenues / fetchPromoters instead.
 */

import 'server-only'
import { loadVenues } from '@/data/loaders/venuesLoader'
import { loadPromoters } from '@/data/loaders/promotersLoader'
import { loadVenueTags } from '@/data/loaders/venueTagsLoader'
import { loadVenueProfileImageMap, mergeVenueProfileImages } from '@/lib/venueProfileImages'
import {
  filterVenuesByFontes,
  loadFontesHandleSets,
  resolvePromotersCatalog,
} from '@/lib/catalogFontesSplit'
import type { VenueForDisplay } from '@/lib/eventsAdapter'
import type { Promoter } from '@/models/Promoter'

function sanitizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (lower.includes('cdninstagram') || lower.includes('fbcdn.net')) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}`
  }
  return url
}

export async function loadVenuesForDisplay(): Promise<VenueForDisplay[]> {
  const venueTagsUrl = process.env.NEXT_PUBLIC_VENUE_TAGS_CSV_URL
  const venueTags = venueTagsUrl ? await loadVenueTags(venueTagsUrl) : []
  const allowedVenueTags = venueTags.length > 0 ? venueTags : null
  const [{ venues }, imageByHandle, fontes] = await Promise.all([
    loadVenues(process.env.NEXT_PUBLIC_VENUES_CSV_URL, allowedVenueTags),
    loadVenueProfileImageMap(),
    loadFontesHandleSets(),
  ])
  const withImages = mergeVenueProfileImages(venues, imageByHandle)
  const mapped = withImages.map((v) => ({
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
  return filterVenuesByFontes(mapped, fontes)
}

export async function loadPromotersForDisplay(): Promise<Promoter[]> {
  const venueTagsUrl = process.env.NEXT_PUBLIC_VENUE_TAGS_CSV_URL
  const venueTags = venueTagsUrl ? await loadVenueTags(venueTagsUrl) : []
  const allowedVenueTags = venueTags.length > 0 ? venueTags : null

  const [csvPromoters, { venues }, imageByHandle, fontes] = await Promise.all([
    loadPromoters(process.env.NEXT_PUBLIC_PROMOTERS_CSV_URL),
    loadVenues(process.env.NEXT_PUBLIC_VENUES_CSV_URL, allowedVenueTags),
    loadVenueProfileImageMap(),
    loadFontesHandleSets(),
  ])

  const venueLike = venues.map((v) => ({
    venue_id: v.venue_id,
    name: v.name,
    slug: v.slug,
    description_short: v.description_short,
    primary_image_url: v.primary_image_url,
    website_url: v.website_url,
    instagram_handle: v.instagram_handle,
    tags: v.tags ?? [],
  }))

  const resolved = resolvePromotersCatalog(csvPromoters, venueLike, fontes)
  const withImages = mergeVenueProfileImages(resolved, imageByHandle)
  return withImages.map((p) => ({
    ...p,
    primary_image_url: sanitizeImageUrl(p.primary_image_url),
  }))
}
