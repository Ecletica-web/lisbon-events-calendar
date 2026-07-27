/**
 * Upsert proposed venues / promoters when extract finds unknown names or @mentions.
 * Humans review at /admin/catalog-candidates → approve into Supabase catalog.
 */

import { normalizeIgHandle } from './fontes-ig'
import { getSupabaseStore, isSupabaseStoreConfigured } from './supabase-store'

export type CatalogCandidateKind = 'venue' | 'promoter'

export interface CatalogCandidateSighting {
  kind: CatalogCandidateKind
  proposed_name: string
  proposed_handle?: string
  suggested_city?: string
  evidence_summary?: string
  sample_source_url?: string
  sample_caption?: string
  sample_owner_username?: string
  sample_venue_name_raw?: string
  source_event_id?: string
}

function normalizeNameKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function catalogCandidateIdentityKey(name: string, handle?: string): string | null {
  const h = normalizeIgHandle(handle || '')
  if (h) return `h:${h}`
  const n = normalizeNameKey(name)
  if (!n || n.length < 2) return null
  return `n:${n}`
}

/** Skip junk / placeholder venue strings. */
export function isPlausibleCatalogName(name: string): boolean {
  const n = normalizeNameKey(name)
  if (!n || n.length < 2) return false
  if (/^(unknown|tbd|tba|n a|na|lisboa|lisbon|portugal|online|tba)$/i.test(n)) return false
  if (/^https?:/.test(name.trim())) return false
  return true
}

let knownHandlesCache: Set<string> | null = null
let knownHandlesCachedAt = 0
const KNOWN_HANDLES_TTL_MS = 5 * 60 * 1000

export function clearKnownCatalogHandlesCache(): void {
  knownHandlesCache = null
  knownHandlesCachedAt = 0
}

export async function loadKnownCatalogHandles(): Promise<Set<string>> {
  if (
    knownHandlesCache &&
    Date.now() - knownHandlesCachedAt < KNOWN_HANDLES_TTL_MS
  ) {
    return knownHandlesCache
  }
  const set = new Set<string>()
  if (!isSupabaseStoreConfigured()) {
    knownHandlesCache = set
    knownHandlesCachedAt = Date.now()
    return set
  }
  const sb = getSupabaseStore()
  const [v, p] = await Promise.all([
    sb.from('venues').select('instagram_handle'),
    sb.from('promoters').select('instagram_handle'),
  ])
  for (const row of (v.data as Array<{ instagram_handle: string | null }>) || []) {
    const h = normalizeIgHandle(row.instagram_handle || '')
    if (h) set.add(h)
  }
  for (const row of (p.data as Array<{ instagram_handle: string | null }>) || []) {
    const h = normalizeIgHandle(row.instagram_handle || '')
    if (h) set.add(h)
  }
  knownHandlesCache = set
  knownHandlesCachedAt = Date.now()
  return set
}

/**
 * Insert or bump a pending candidate. Approved/rejected rows are left alone
 * (same identity_key stays closed until manually reopened).
 */
export async function upsertCatalogCandidateSighting(
  sighting: CatalogCandidateSighting,
  dryRun = false
): Promise<'inserted' | 'bumped' | 'skipped' | 'dry_run'> {
  if (!isSupabaseStoreConfigured()) return 'skipped'
  const name = sighting.proposed_name.trim()
  if (!isPlausibleCatalogName(name) && !normalizeIgHandle(sighting.proposed_handle || '')) {
    return 'skipped'
  }
  const handle = normalizeIgHandle(sighting.proposed_handle || '') || null
  const identity_key = catalogCandidateIdentityKey(name, handle || undefined)
  if (!identity_key) return 'skipped'

  if (dryRun) {
    console.log(
      `[catalog-candidates] dry-run ${sighting.kind} ${identity_key} name=${name}`
    )
    return 'dry_run'
  }

  const sb = getSupabaseStore()
  const now = new Date().toISOString()
  const { data: existing, error: findErr } = await sb
    .from('pipeline_catalog_candidates')
    .select('id, status, sighting_count')
    .eq('kind', sighting.kind)
    .eq('identity_key', identity_key)
    .maybeSingle()

  if (findErr) {
    console.warn('[catalog-candidates] lookup:', findErr.message)
    return 'skipped'
  }

  if (existing) {
    if (existing.status !== 'pending') return 'skipped'
    const { error } = await sb
      .from('pipeline_catalog_candidates')
      .update({
        proposed_name: name,
        proposed_handle: handle,
        suggested_city: sighting.suggested_city?.trim() || null,
        evidence_summary: sighting.evidence_summary?.trim() || null,
        sample_source_url: sighting.sample_source_url || null,
        sample_caption: (sighting.sample_caption || '').slice(0, 2000) || null,
        sample_owner_username: sighting.sample_owner_username || null,
        sample_venue_name_raw: sighting.sample_venue_name_raw || null,
        last_source_event_id: sighting.source_event_id || null,
        sighting_count: (existing.sighting_count ?? 1) + 1,
        last_seen_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
    if (error) {
      console.warn('[catalog-candidates] bump:', error.message)
      return 'skipped'
    }
    return 'bumped'
  }

  const { error } = await sb.from('pipeline_catalog_candidates').insert({
    kind: sighting.kind,
    status: 'pending',
    identity_key,
    proposed_name: name,
    proposed_handle: handle,
    suggested_city: sighting.suggested_city?.trim() || null,
    evidence_summary: sighting.evidence_summary?.trim() || null,
    sample_source_url: sighting.sample_source_url || null,
    sample_caption: (sighting.sample_caption || '').slice(0, 2000) || null,
    sample_owner_username: sighting.sample_owner_username || null,
    sample_venue_name_raw: sighting.sample_venue_name_raw || null,
    last_source_event_id: sighting.source_event_id || null,
    sighting_count: 1,
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now,
  })
  if (error) {
    // Race on unique key — treat as bump attempt
    if (/duplicate|unique/i.test(error.message)) {
      return 'bumped'
    }
    console.warn('[catalog-candidates] insert:', error.message)
    return 'skipped'
  }
  return 'inserted'
}

export function parseMentionHandles(mentionsPipe: string): string[] {
  if (!mentionsPipe?.trim()) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of mentionsPipe.split(/[|,;\s]+/)) {
    const h = normalizeIgHandle(part)
    if (!h || seen.has(h)) continue
    seen.add(h)
    out.push(h)
  }
  return out
}
