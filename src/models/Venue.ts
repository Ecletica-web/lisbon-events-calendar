/**
 * Domain model for Venue — stable schema for ingestion
 */

export interface Venue {
  venue_id: string
  venue_name: string
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
