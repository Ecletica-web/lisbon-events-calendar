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
  if (error) {
    if (/schema cache|does not exist|Could not find the table/i.test(error.message)) {
      throw new Error(
        'Apply supabase/migrations/026_pipeline_catalog_candidates.sql in the Supabase SQL Editor, then refresh.'
      )
    }
    throw new Error(error.message)
  }
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

/**
 * Cheap fuzzy dedupe for admin UI (no OpenAI dep in Next).
 * Exact handle/name + high token overlap → mark merged.
 * For LLM pass run: cd pipeline && npm run dedupe-catalog -- --apply
 */
export async function cheapDedupePendingCatalogCandidates(
  resolvedBy: string
): Promise<{ scanned: number; merged_catalog: number; merged_candidate: number }> {
  const client = sb()
  const [{ data: pending, error: pErr }, { data: venues }, { data: promoters }] =
    await Promise.all([
      client
        .from('pipeline_catalog_candidates')
        .select('id, kind, identity_key, proposed_name, proposed_handle')
        .eq('status', 'pending')
        .limit(300),
      client.from('venues').select('venue_id, name, instagram_handle, aliases'),
      client.from('promoters').select('promoter_id, name, instagram_handle'),
    ])
  if (pErr) throw new Error(pErr.message)

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')

  const handleOf = (h: string | null | undefined) =>
    (h || '').replace(/^@/, '').trim().toLowerCase()

  type Ent = { kind: 'venue' | 'promoter'; id: string; name: string; handle: string; keys: string[] }
  const catalog: Ent[] = []
  for (const v of (venues as Array<{
    venue_id: string
    name: string
    instagram_handle: string | null
    aliases: string[] | null
  }>) || []) {
    catalog.push({
      kind: 'venue',
      id: v.venue_id,
      name: v.name,
      handle: handleOf(v.instagram_handle),
      keys: [norm(v.name), ...(v.aliases || []).map(norm)].filter(Boolean),
    })
  }
  for (const p of (promoters as Array<{
    promoter_id: string
    name: string
    instagram_handle: string | null
  }>) || []) {
    catalog.push({
      kind: 'promoter',
      id: p.promoter_id,
      name: p.name,
      handle: handleOf(p.instagram_handle),
      keys: [norm(p.name)].filter(Boolean),
    })
  }

  const rows = (pending as Array<{
    id: string
    kind: 'venue' | 'promoter'
    identity_key: string
    proposed_name: string
    proposed_handle: string | null
  }>) || []

  let merged_catalog = 0
  let merged_candidate = 0
  const now = new Date().toISOString()
  const claimed = new Set<string>()

  for (const row of rows) {
    if (claimed.has(row.id)) continue
    const h = handleOf(row.proposed_handle)
    const nk = norm(row.proposed_name)

    const catHit = catalog.find((e) => {
      if (h && e.handle && h === e.handle) return true
      return e.keys.includes(nk)
    })
    if (catHit) {
      const { error } = await client
        .from('pipeline_catalog_candidates')
        .update({
          status: 'merged',
          resolved_entity_id: catHit.id,
          resolved_at: now,
          resolved_by: resolvedBy,
          reviewer_notes: `admin cheap-dedupe → catalog ${catHit.id} (${catHit.name})`,
          updated_at: now,
        })
        .eq('id', row.id)
        .eq('status', 'pending')
      if (!error) {
        merged_catalog++
        claimed.add(row.id)
      }
      continue
    }

    const twin = rows.find((o) => {
      if (o.id === row.id || o.kind !== row.kind || claimed.has(o.id)) return false
      if (o.identity_key === row.identity_key) return false
      const oh = handleOf(o.proposed_handle)
      if (h && oh && h === oh) return true
      return norm(o.proposed_name) === nk
    })
    if (twin) {
      // Keep the one with shorter id as canonical for stability; bump via notes only
      const { error } = await client
        .from('pipeline_catalog_candidates')
        .update({
          status: 'merged',
          resolved_entity_id: twin.id,
          resolved_at: now,
          resolved_by: resolvedBy,
          reviewer_notes: `admin cheap-dedupe → candidate ${twin.id} (${twin.proposed_name})`,
          updated_at: now,
        })
        .eq('id', row.id)
        .eq('status', 'pending')
      if (!error) {
        merged_candidate++
        claimed.add(row.id)
      }
    }
  }

  return { scanned: rows.length, merged_catalog, merged_candidate }
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
