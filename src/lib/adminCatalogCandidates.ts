/**
 * Admin access for pipeline_catalog_candidates (proposed venues / promoters).
 */

import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { upsertVenue, upsertPromoter } from '@/lib/adminCatalog'

export type CatalogCandidateKind = 'venue' | 'promoter'
export type CatalogCandidateStatus = 'pending' | 'approved' | 'rejected' | 'merged'

export type CatalogCandidateRow = {
  id: string
  kind: CatalogCandidateKind
  status: CatalogCandidateStatus
  identity_key: string
  proposed_name: string
  proposed_handle: string | null
  suggested_city: string | null
  suggested_aliases: string[] | null
  evidence_summary: string | null
  sample_source_url: string | null
  sample_caption: string | null
  sample_owner_username: string | null
  sample_venue_name_raw: string | null
  last_source_event_id: string | null
  sighting_count: number
  first_seen_at: string
  last_seen_at: string
  resolved_entity_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  reviewer_notes: string | null
  created_at: string
  updated_at: string
}

function sb() {
  if (!supabaseServer) throw new Error('Supabase not configured')
  return supabaseServer
}

export async function countPendingCatalogCandidates(): Promise<number> {
  if (!supabaseServer) return 0
  const { count } = await supabaseServer
    .from('pipeline_catalog_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return count ?? 0
}

export async function listCatalogCandidates(
  status: CatalogCandidateStatus | 'all' = 'pending',
  kind?: CatalogCandidateKind | 'all'
): Promise<CatalogCandidateRow[]> {
  let q = sb()
    .from('pipeline_catalog_candidates')
    .select('*')
    .order('sighting_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(200)
  if (status !== 'all') q = q.eq('status', status)
  if (kind && kind !== 'all') q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data as CatalogCandidateRow[]) ?? []
}

export async function rejectCatalogCandidate(
  id: string,
  resolvedBy: string,
  notes?: string
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await sb()
    .from('pipeline_catalog_candidates')
    .update({
      status: 'rejected',
      resolved_at: now,
      resolved_by: resolvedBy,
      reviewer_notes: notes?.trim() || null,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)
}

export type ApproveCatalogCandidateInput = {
  id: string
  kind: CatalogCandidateKind
  name: string
  instagram_handle?: string
  city?: string
  neighborhood?: string
  address?: string
  aliases?: string
  venue_id?: string
  promoter_id?: string
  resolvedBy: string
  notes?: string
}

/**
 * Approve → upsert into venues/promoters catalog, mark candidate resolved.
 * Does not auto-re-resolve review queue (run re-resolve-review-queue after batch).
 */
export async function approveCatalogCandidate(
  input: ApproveCatalogCandidateInput
): Promise<{ entityId: string }> {
  const name = input.name.trim()
  if (!name) throw new Error('name required')

  let entityId: string
  if (input.kind === 'venue') {
    const venue = await upsertVenue({
      venue_id: input.venue_id,
      name,
      instagram_handle: input.instagram_handle,
      city: input.city,
      neighborhood: input.neighborhood,
      address: input.address,
      aliases: input.aliases,
      is_active: true,
    })
    entityId = venue.venue_id
  } else {
    const promoter = await upsertPromoter({
      promoter_id: input.promoter_id,
      name,
      instagram_handle: input.instagram_handle,
      is_active: true,
    })
    entityId = promoter.promoter_id
  }

  const now = new Date().toISOString()
  const { error } = await sb()
    .from('pipeline_catalog_candidates')
    .update({
      status: 'approved',
      kind: input.kind,
      proposed_name: name,
      proposed_handle: input.instagram_handle?.replace(/^@/, '').trim().toLowerCase() || null,
      resolved_entity_id: entityId,
      resolved_at: now,
      resolved_by: input.resolvedBy,
      reviewer_notes: input.notes?.trim() || null,
      updated_at: now,
    })
    .eq('id', input.id)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)

  return { entityId }
}
