/**
 * Domain model for Venue — stable schema for ingestion
 */

export interface Venue {
  venue_id: string
  name: string
  slug: string
  /** Pipe-separated in CSV; parsed to string[] */
  aliases: string[]
  instagram_handle?: string
  primary_image_url?: string
  description_short?: string
  website_url?: string
  venue_address?: string
  neighborhood?: string
  city?: string
  region?: string
  country?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  venue_url?: string
  instagram_url?: string
  tags: string[]
  created_at?: string
  updated_at?: string
  _error?: string
}

/** Backward compat: venue_name alias for name */
export type VenueLegacy = Venue & { venue_name?: string }
