/**
 * Venues loader — fetches from CSV if URL set, else merges from canonical venues
 */

import Papa from 'papaparse'
import type { Venue } from '@/models/Venue'
import { normalizeTags, normalizeNumber } from './utils'
import { CANONICAL_VENUES } from '@/data/canonicalVenues'

export interface RawVenueRow {
  [key: string]: string | number | boolean | string[] | undefined
  venue_id?: string
  venue_name?: string
  venue_address?: string
  neighborhood?: string
  city?: string
  region?: string
  country?: string
  postal_code?: string
  latitude?: string | number
  longitude?: string | number
  venue_url?: string
  instagram_url?: string
  tags?: string | string[]
  created_at?: string
  updated_at?: string
}

export interface LoadVenuesResult {
  venues: Venue[]
  quarantined: { row: RawVenueRow; error: string }[]
}

/** Slug for venue URL */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeVenue(raw: RawVenueRow): Venue | null {
  const venueId = raw.venue_id?.toString().trim()
  const venueName = raw.venue_name?.toString().trim()
  if (!venueId && !venueName) return null

  const id = venueId || toSlug(venueName || 'unknown')
  const name = venueName || id
  const tags = normalizeTags(raw.tags)
  const lat = normalizeNumber(raw.latitude)
  const lng = normalizeNumber(raw.longitude)

  return {
    venue_id: id,
    venue_name: name,
    venue_address: raw.venue_address?.toString().trim() || undefined,
    neighborhood: raw.neighborhood?.toString().trim() || undefined,
    city: raw.city?.toString().trim() || undefined,
    region: raw.region?.toString().trim() || undefined,
    country: raw.country?.toString().trim() || undefined,
    postal_code: raw.postal_code?.toString().trim() || undefined,
    latitude: lat ?? undefined,
    longitude: lng ?? undefined,
    venue_url: raw.venue_url?.toString().trim() || undefined,
    instagram_url: raw.instagram_url?.toString().trim() || undefined,
    tags,
    created_at: raw.created_at?.toString().trim() || undefined,
    updated_at: raw.updated_at?.toString().trim() || undefined,
  }
}

export async function loadVenues(csvUrl?: string | null): Promise<LoadVenuesResult> {
  const quarantined: { row: RawVenueRow; error: string }[] = []

  if (csvUrl) {
    try {
      const response = await fetch(csvUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Failed to fetch venues CSV: ${response.statusText}`)
      }
      const csvText = await response.text()
      return new Promise((resolve) => {
        Papa.parse<RawVenueRow>(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const venues: Venue[] = []
            for (const row of results.data) {
              const v = normalizeVenue(row)
              if (v) venues.push(v)
              else quarantined.push({ row, error: 'Missing venue_id/venue_name' })
            }
            resolve({ venues, quarantined })
          },
          error: (err: Error) => {
            console.error('[venuesLoader] PapaParse error:', err)
            // Fall through to canonical
          },
        })
      })
    } catch (err) {
      console.error('[venuesLoader] Fetch error:', err)
      // Fall through to canonical
    }
  }

  // Fallback: convert canonical venues to Venue format
  const venues: Venue[] = CANONICAL_VENUES.map((c) => ({
    venue_id: c.key,
    venue_name: c.name,
    tags: [],
    instagram_url: c.handle ? `https://instagram.com/${c.handle.replace(/^@/, '')}` : undefined,
  }))

  return { venues, quarantined }
}
