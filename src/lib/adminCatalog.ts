/**
 * Admin + app catalog access for Supabase venues / promoters tables.
 * Service-role writes after requireAdmin; public SELECT via RLS for reads.
 */

import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import type { Venue } from '@/models/Venue'
import type { Promoter } from '@/models/Promoter'

export type CatalogSource = 'sheets' | 'supabase' | 'auto'

export function getCatalogSource(): CatalogSource {
  const v = (process.env.CATALOG_SOURCE || 'auto').trim().toLowerCase()
  if (v === 'sheets' || v === 'supabase') return v
  return 'auto'
}

function normalizeHandle(raw?: string | null): string {
  if (!raw) return ''
  let h = raw.trim()
  if (!h) return ''
  const ig = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (ig) h = ig[1]
  return h.replace(/^@/, '').toLowerCase().split(/[/?#]/)[0]
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

type VenueRow = {
  venue_id: string
  name: string
  slug: string
  aliases: string[] | null
  instagram_handle: string | null
  primary_image_url: string | null
  description_short: string | null
  website_url: string | null
  venue_tags: string[] | null
  address: string | null
  city: string | null
  neighborhood: string | null
  region: string | null
  country: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  venue_url: string | null
  instagram_url: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type PromoterRow = {
  promoter_id: string
  name: string
  slug: string
  instagram_handle: string | null
  website_url: string | null
  description_short: string | null
  primary_image_url: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

function venueFromRow(r: VenueRow): Venue {
  return {
    venue_id: r.venue_id,
    name: r.name,
    slug: r.slug || r.venue_id,
    aliases: r.aliases ?? [],
    instagram_handle: r.instagram_handle ?? undefined,
    primary_image_url: r.primary_image_url ?? undefined,
    description_short: r.description_short ?? undefined,
    website_url: r.website_url ?? undefined,
    venue_address: r.address ?? undefined,
    neighborhood: r.neighborhood ?? undefined,
    city: r.city ?? undefined,
    region: r.region ?? undefined,
    country: r.country ?? undefined,
    postal_code: r.postal_code ?? undefined,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    venue_url: r.venue_url ?? undefined,
    instagram_url: r.instagram_url ?? undefined,
    tags: r.venue_tags ?? [],
    is_active: r.is_active !== false,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function promoterFromRow(r: PromoterRow): Promoter {
  return {
    promoter_id: r.promoter_id,
    name: r.name,
    slug: r.slug || r.promoter_id,
    instagram_handle: r.instagram_handle ?? undefined,
    website_url: r.website_url ?? undefined,
    description_short: r.description_short ?? undefined,
    primary_image_url: r.primary_image_url ?? undefined,
    is_active: r.is_active !== false,
  }
}

export async function countCatalogRows(): Promise<{ venues: number; promoters: number }> {
  if (!supabaseServer) return { venues: 0, promoters: 0 }
  const [v, p] = await Promise.all([
    supabaseServer.from('venues').select('venue_id', { count: 'exact', head: true }),
    supabaseServer.from('promoters').select('promoter_id', { count: 'exact', head: true }),
  ])
  return { venues: v.count ?? 0, promoters: p.count ?? 0 }
}

export async function loadCatalogVenues(opts?: {
  activeOnly?: boolean
}): Promise<Venue[]> {
  if (!supabaseServer) return []
  let q = supabaseServer.from('venues').select('*').order('name')
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) {
    console.warn('[adminCatalog] load venues:', error.message)
    return []
  }
  return ((data as VenueRow[]) || []).map(venueFromRow)
}

export async function loadCatalogPromoters(opts?: {
  activeOnly?: boolean
}): Promise<Promoter[]> {
  if (!supabaseServer) return []
  let q = supabaseServer.from('promoters').select('*').order('name')
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) {
    console.warn('[adminCatalog] load promoters:', error.message)
    return []
  }
  return ((data as PromoterRow[]) || []).map(promoterFromRow)
}

export type VenueUpsertInput = {
  venue_id?: string
  name: string
  slug?: string
  aliases?: string[] | string
  instagram_handle?: string | null
  primary_image_url?: string | null
  description_short?: string | null
  website_url?: string | null
  venue_tags?: string[] | string
  address?: string | null
  city?: string | null
  neighborhood?: string | null
  region?: string | null
  country?: string | null
  postal_code?: string | null
  latitude?: number | null
  longitude?: number | null
  venue_url?: string | null
  instagram_url?: string | null
  is_active?: boolean
}

export type PromoterUpsertInput = {
  promoter_id?: string
  name: string
  slug?: string
  instagram_handle?: string | null
  website_url?: string | null
  description_short?: string | null
  primary_image_url?: string | null
  is_active?: boolean
}

function parsePipeList(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  return String(v)
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
}

export async function upsertVenue(input: VenueUpsertInput): Promise<Venue> {
  if (!supabaseServer) throw new Error('Supabase not configured')
  const name = input.name.trim()
  if (!name) throw new Error('name required')
  const venue_id = (input.venue_id || slugify(name)).trim()
  if (!venue_id) throw new Error('venue_id required')
  const handle = normalizeHandle(input.instagram_handle) || null
  const row = {
    venue_id,
    name,
    slug: (input.slug || slugify(name) || venue_id).trim(),
    aliases: parsePipeList(input.aliases),
    instagram_handle: handle,
    primary_image_url: input.primary_image_url?.trim() || null,
    description_short: input.description_short?.trim() || null,
    website_url: input.website_url?.trim() || null,
    venue_tags: parsePipeList(input.venue_tags),
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    neighborhood: input.neighborhood?.trim() || null,
    region: input.region?.trim() || null,
    country: input.country?.trim() || null,
    postal_code: input.postal_code?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    venue_url: input.venue_url?.trim() || null,
    instagram_url: input.instagram_url?.trim() || (handle ? `https://www.instagram.com/${handle}/` : null),
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabaseServer
    .from('venues')
    .upsert(row, { onConflict: 'venue_id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return venueFromRow(data as VenueRow)
}

export async function upsertPromoter(input: PromoterUpsertInput): Promise<Promoter> {
  if (!supabaseServer) throw new Error('Supabase not configured')
  const name = input.name.trim()
  if (!name) throw new Error('name required')
  const promoter_id = (input.promoter_id || slugify(name)).trim()
  if (!promoter_id) throw new Error('promoter_id required')
  const handle = normalizeHandle(input.instagram_handle) || null
  const row = {
    promoter_id,
    name,
    slug: (input.slug || slugify(name) || promoter_id).trim(),
    instagram_handle: handle,
    website_url: input.website_url?.trim() || null,
    description_short: input.description_short?.trim() || null,
    primary_image_url: input.primary_image_url?.trim() || null,
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabaseServer
    .from('promoters')
    .upsert(row, { onConflict: 'promoter_id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return promoterFromRow(data as PromoterRow)
}

export async function setVenueActive(venueId: string, isActive: boolean): Promise<void> {
  if (!supabaseServer) throw new Error('Supabase not configured')
  const { error } = await supabaseServer
    .from('venues')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId)
  if (error) throw new Error(error.message)
}

export async function setPromoterActive(promoterId: string, isActive: boolean): Promise<void> {
  if (!supabaseServer) throw new Error('Supabase not configured')
  const { error } = await supabaseServer
    .from('promoters')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('promoter_id', promoterId)
  if (error) throw new Error(error.message)
}

/** Derived scrape watchlist from Supabase catalog. */
export async function loadWatchlistFromCatalog(): Promise<
  Array<{ handle: string; type: 'venue' | 'promoter'; active: boolean; notes: string; name: string }>
> {
  const [venues, promoters] = await Promise.all([
    loadCatalogVenues({ activeOnly: false }),
    loadCatalogPromoters({ activeOnly: false }),
  ])
  const byHandle = new Map<
    string,
    { handle: string; type: 'venue' | 'promoter'; active: boolean; notes: string; name: string }
  >()
  for (const v of venues) {
    const h = normalizeHandle(v.instagram_handle)
    if (!h) continue
    if (!byHandle.has(h)) {
      byHandle.set(h, {
        handle: h,
        type: 'venue',
        active: v.is_active !== false,
        notes: v.name,
        name: v.name,
      })
    }
  }
  for (const p of promoters) {
    const h = normalizeHandle(p.instagram_handle)
    if (!h) continue
    if (!byHandle.has(h)) {
      byHandle.set(h, {
        handle: h,
        type: 'promoter',
        active: p.is_active !== false,
        notes: p.name,
        name: p.name,
      })
    }
  }
  return [...byHandle.values()]
}
