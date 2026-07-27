/**
 * Catalog type split — Venues CSV and Promoters CSV are separate SoTs.
 * Fontes IG is no longer consulted; helpers kept as pass-throughs for call sites.
 */

import type { Promoter } from '@/models/Promoter'

/** Minimal venue shape for catalog helpers. */
export type CatalogVenueLike = {
  venue_id: string
  name: string
  slug: string
  neighborhood?: string
  venue_address?: string
  description_short?: string
  primary_image_url?: string
  website_url?: string
  instagram_handle?: string
  tags: string[]
  latitude?: number
  longitude?: number
}

/** @deprecated Empty — catalogs are already split by sheet/CSV. */
export type FontesHandleSets = {
  venueHandles: Set<string>
  promoterHandles: Set<string>
  promoterNames: Map<string, string>
}

/** @deprecated No-op; Venues/Promoters CSVs are authoritative. */
export async function loadFontesHandleSets(): Promise<FontesHandleSets> {
  return {
    venueHandles: new Set(),
    promoterHandles: new Set(),
    promoterNames: new Map(),
  }
}

/** Pass-through — promoter handles no longer pulled from Fontes. */
export function filterVenuesByFontes<T extends CatalogVenueLike>(
  venues: T[],
  _fontes?: FontesHandleSets
): T[] {
  return venues
}

/** Prefer Promoters CSV rows; ignore Fontes synthesis. */
export function resolvePromotersCatalog(
  csvPromoters: Promoter[],
  _venues: CatalogVenueLike[],
  _fontes?: FontesHandleSets
): Promoter[] {
  return csvPromoters
    .filter((p) => p.is_active)
    .sort((a, b) => a.name.localeCompare(b.name))
}
