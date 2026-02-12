/**
 * Venues loader — fetches from CSV if URL set, else merges from canonical venues
 */

import Papa from 'papaparse'
import type { Venue } from '@/models/Venue'
import { normalizeVenueTags, normalizeNumber } from './utils'
import { resolveVenueColumn } from '@/data/schema/venueColumns'
import { CANONICAL_VENUES } from '@/data/canonicalVenues'

export interface RawVenueRow {
  [key: string]: string | number | boolean | string[] | undefined
}

export interface LoadVenuesResult {
  venues: Venue[]
  quarantined: { row: RawVenueRow; error: string; reason: string }[]
}

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

function getRaw(row: RawVenueRow, col: string): string | undefined {
  const resolved = resolveVenueColumn(col)
  const val = row[resolved] ?? row[col]
  return val?.toString().trim() || undefined
}

export function normalizeVenue(raw: RawVenueRow, allowedVenueTags?: string[] | null): Venue | null {
  const venueId = getRaw(raw, 'venue_id')
  const name = getRaw(raw, 'name') ?? getRaw(raw, 'venue_name')
  if (!venueId && !name) return null

  const id = venueId || toSlug(name || 'unknown')
  const displayName = name || id
  const slug = getRaw(raw, 'slug') || toSlug(displayName)
  const aliasesStr = getRaw(raw, 'aliases')
  const aliases = aliasesStr
    ? aliasesStr.split('|').map((a) => a.trim()).filter(Boolean)
    : []
  const venueTagsRaw = getRaw(raw, 'venue_tags') ?? getRaw(raw, 'tags') ?? raw.tags
  const tags = normalizeVenueTags(venueTagsRaw, allowedVenueTags)
  const lat = normalizeNumber(raw.latitude ?? raw.lat)
  const lng = normalizeNumber(raw.longitude ?? raw.lng)

  return {
    venue_id: id,
    name: displayName,
    slug,
    aliases,
    instagram_handle: getRaw(raw, 'instagram_handle') ?? undefined,
    primary_image_url: getRaw(raw, 'primary_image_url') ?? undefined,
    description_short: getRaw(raw, 'description_short') ?? undefined,
    website_url: getRaw(raw, 'website_url') ?? getRaw(raw, 'venue_url') ?? undefined,
    venue_address: getRaw(raw, 'address') ?? getRaw(raw, 'venue_address') ?? undefined,
    neighborhood: getRaw(raw, 'neighborhood') ?? undefined,
    city: getRaw(raw, 'city') ?? undefined,
    region: getRaw(raw, 'region') ?? undefined,
    country: getRaw(raw, 'country') ?? undefined,
    postal_code: getRaw(raw, 'postal_code') ?? undefined,
    latitude: lat ?? undefined,
    longitude: lng ?? undefined,
    venue_url: getRaw(raw, 'venue_url') ?? undefined,
    instagram_url: getRaw(raw, 'instagram_url') ?? undefined,
    tags,
    created_at: getRaw(raw, 'created_at') ?? undefined,
    updated_at: getRaw(raw, 'updated_at') ?? undefined,
  }
}

export async function loadVenues(
  csvUrl?: string | null,
  allowedVenueTags?: string[] | null
): Promise<LoadVenuesResult> {
  const quarantined: { row: RawVenueRow; error: string; reason: string }[] = []

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
              const v = normalizeVenue(row, allowedVenueTags)
              if (v) venues.push(v)
              else quarantined.push({
                row,
                error: 'Missing venue_id/name',
                reason: 'missing_required',
              })
            }
            resolve({ venues, quarantined })
          },
          error: (err: Error) => {
            console.error('[venuesLoader] PapaParse error:', err)
          },
        })
      })
    } catch (err) {
      console.error('[venuesLoader] Fetch error:', err)
    }
  }

  // Fallback: convert canonical venues to Venue format
  const venues: Venue[] = CANONICAL_VENUES.map((c) => ({
    venue_id: c.key,
    name: c.name,
    slug: c.key,
    aliases: [],
    instagram_handle: c.handle || undefined,
    tags: [],
    instagram_url: c.handle ? `https://instagram.com/${c.handle.replace(/^@/, '')}` : undefined,
  }))

  return { venues, quarantined }
}
