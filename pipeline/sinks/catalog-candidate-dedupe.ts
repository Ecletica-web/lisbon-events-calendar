/**
 * Catalog candidate dedupe — cheap string scoring + optional OpenAI for ambiguous pairs.
 * Used at sighting insert-time and by `npm run dedupe-catalog-candidates`.
 */

import { z } from 'zod'
import { textChatJson, extractJson } from '../intelligence/vision-client'
import { normalizeIgHandle } from './fontes-ig'
import { getSupabaseStore, isSupabaseStoreConfigured } from './supabase-store'
import type { CatalogCandidateKind } from './catalog-candidates'

export function normalizeCatalogNameKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export type CatalogEntityRef = {
  kind: CatalogCandidateKind
  entity_id: string
  name: string
  handle: string | null
  aliases: string[]
  name_key: string
  alias_keys: string[]
}

export type PendingCandidateRef = {
  id: string
  kind: CatalogCandidateKind
  identity_key: string
  proposed_name: string
  proposed_handle: string | null
  name_key: string
  sighting_count: number
}

export type DedupeDecision =
  | { action: 'novel' }
  | {
      action: 'merge_catalog'
      entity_id: string
      entity_name: string
      score: number
      method: 'exact_handle' | 'exact_name' | 'fuzzy' | 'llm'
      reason: string
    }
  | {
      action: 'merge_candidate'
      candidate_id: string
      candidate_name: string
      score: number
      method: 'exact_handle' | 'exact_name' | 'fuzzy' | 'llm'
      reason: string
    }

const AUTO_MERGE_SCORE = 0.9
const LLM_MIN_SCORE = 0.55

function tokens(key: string): Set<string> {
  return new Set(key.split(' ').filter((t) => t.length > 1))
}

/** Jaccard on name tokens + containment bonus. */
export function nameSimilarity(a: string, b: string): number {
  const ka = normalizeCatalogNameKey(a)
  const kb = normalizeCatalogNameKey(b)
  if (!ka || !kb) return 0
  if (ka === kb) return 1
  if (ka.includes(kb) || kb.includes(ka)) {
    const shorter = Math.min(ka.length, kb.length)
    const longer = Math.max(ka.length, kb.length)
    return 0.82 + 0.18 * (shorter / longer)
  }
  const ta = tokens(ka)
  const tb = tokens(kb)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

function bestNameScore(
  proposedName: string,
  entity: { name: string; aliases: string[] }
): number {
  let best = nameSimilarity(proposedName, entity.name)
  for (const a of entity.aliases) {
    best = Math.max(best, nameSimilarity(proposedName, a))
  }
  return best
}

let catalogCache: CatalogEntityRef[] | null = null
let catalogCachedAt = 0
const CATALOG_TTL_MS = 5 * 60 * 1000

export function clearCatalogDedupeCache(): void {
  catalogCache = null
  catalogCachedAt = 0
}

export async function loadCatalogEntitiesForDedupe(): Promise<CatalogEntityRef[]> {
  if (catalogCache && Date.now() - catalogCachedAt < CATALOG_TTL_MS) return catalogCache
  if (!isSupabaseStoreConfigured()) {
    catalogCache = []
    catalogCachedAt = Date.now()
    return catalogCache
  }
  const sb = getSupabaseStore()
  const [v, p] = await Promise.all([
    sb.from('venues').select('venue_id, name, instagram_handle, aliases'),
    sb.from('promoters').select('promoter_id, name, instagram_handle'),
  ])
  const out: CatalogEntityRef[] = []
  for (const row of (v.data as Array<{
    venue_id: string
    name: string
    instagram_handle: string | null
    aliases: string[] | null
  }>) || []) {
    const aliases = row.aliases ?? []
    out.push({
      kind: 'venue',
      entity_id: row.venue_id,
      name: row.name,
      handle: normalizeIgHandle(row.instagram_handle || '') || null,
      aliases,
      name_key: normalizeCatalogNameKey(row.name),
      alias_keys: aliases.map(normalizeCatalogNameKey).filter(Boolean),
    })
  }
  for (const row of (p.data as Array<{
    promoter_id: string
    name: string
    instagram_handle: string | null
  }>) || []) {
    out.push({
      kind: 'promoter',
      entity_id: row.promoter_id,
      name: row.name,
      handle: normalizeIgHandle(row.instagram_handle || '') || null,
      aliases: [],
      name_key: normalizeCatalogNameKey(row.name),
      alias_keys: [],
    })
  }
  catalogCache = out
  catalogCachedAt = Date.now()
  return out
}

export async function loadPendingCandidatesForDedupe(
  kind?: CatalogCandidateKind
): Promise<PendingCandidateRef[]> {
  if (!isSupabaseStoreConfigured()) return []
  const sb = getSupabaseStore()
  let q = sb
    .from('pipeline_catalog_candidates')
    .select('id, kind, identity_key, proposed_name, proposed_handle, sighting_count')
    .eq('status', 'pending')
    .limit(500)
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) {
    console.warn('[catalog-dedupe] pending load:', error.message)
    return []
  }
  return ((data as Array<{
    id: string
    kind: CatalogCandidateKind
    identity_key: string
    proposed_name: string
    proposed_handle: string | null
    sighting_count: number
  }>) || []).map((r) => ({
    ...r,
    name_key: normalizeCatalogNameKey(r.proposed_name),
  }))
}

type RankedHit = {
  target: 'catalog' | 'candidate'
  id: string
  name: string
  score: number
  method: 'exact_handle' | 'exact_name' | 'fuzzy'
}

function rankAgainstCatalog(
  kind: CatalogCandidateKind,
  name: string,
  handle: string | null,
  catalog: CatalogEntityRef[]
): RankedHit[] {
  const hits: RankedHit[] = []
  const nameKey = normalizeCatalogNameKey(name)
  for (const e of catalog) {
    const kindBoost = e.kind === kind ? 0 : -0.05
    if (handle && e.handle && handle === e.handle) {
      hits.push({
        target: 'catalog',
        id: e.entity_id,
        name: e.name,
        score: 1,
        method: 'exact_handle',
      })
      continue
    }
    if (nameKey && (nameKey === e.name_key || e.alias_keys.includes(nameKey))) {
      hits.push({
        target: 'catalog',
        id: e.entity_id,
        name: e.name,
        score: Math.min(1, 0.98 + kindBoost),
        method: 'exact_name',
      })
      continue
    }
    const s = bestNameScore(name, e) + kindBoost
    if (s >= LLM_MIN_SCORE) {
      hits.push({
        target: 'catalog',
        id: e.entity_id,
        name: e.name,
        score: Math.min(0.97, s),
        method: 'fuzzy',
      })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 5)
}

function rankAgainstPending(
  kind: CatalogCandidateKind,
  name: string,
  handle: string | null,
  identityKey: string | null,
  pending: PendingCandidateRef[],
  excludeId?: string
): RankedHit[] {
  const hits: RankedHit[] = []
  const nameKey = normalizeCatalogNameKey(name)
  for (const c of pending) {
    if (c.kind !== kind) continue
    if (excludeId && c.id === excludeId) continue
    if (identityKey && c.identity_key === identityKey) continue
    const cHandle = normalizeIgHandle(c.proposed_handle || '') || null
    if (handle && cHandle && handle === cHandle) {
      hits.push({
        target: 'candidate',
        id: c.id,
        name: c.proposed_name,
        score: 1,
        method: 'exact_handle',
      })
      continue
    }
    if (nameKey && nameKey === c.name_key) {
      hits.push({
        target: 'candidate',
        id: c.id,
        name: c.proposed_name,
        score: 0.98,
        method: 'exact_name',
      })
      continue
    }
    const s = nameSimilarity(name, c.proposed_name)
    if (s >= LLM_MIN_SCORE) {
      hits.push({
        target: 'candidate',
        id: c.id,
        name: c.proposed_name,
        score: s,
        method: 'fuzzy',
      })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 5)
}

const llmSchema = z.object({
  decision: z.enum(['novel', 'duplicate_catalog', 'duplicate_candidate']),
  match_id: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
})

async function llmDecideDuplicate(input: {
  kind: CatalogCandidateKind
  proposed_name: string
  proposed_handle: string | null
  evidence?: string
  catalogHits: RankedHit[]
  candidateHits: RankedHit[]
}): Promise<DedupeDecision | null> {
  const catalogOpts = input.catalogHits.map((h) => ({
    id: h.id,
    name: h.name,
    score: Number(h.score.toFixed(3)),
  }))
  const candOpts = input.candidateHits.map((h) => ({
    id: h.id,
    name: h.name,
    score: Number(h.score.toFixed(3)),
  }))
  if (catalogOpts.length === 0 && candOpts.length === 0) return null

  const system = `You decide if a proposed Lisbon venue/promoter catalog candidate is a duplicate of an existing catalog entity or another pending candidate.

Rules:
- Same physical place / org under spelling variants, floors, "Casa X" vs "X", accents, punctuation → duplicate.
- Different places that merely share a word (e.g. two unrelated "Bar" names) → novel.
- Prefer duplicate_catalog over duplicate_candidate when both fit.
- Only pick match_id from the provided lists.
- Respond JSON only: {"decision":"novel"|"duplicate_catalog"|"duplicate_candidate","match_id":"...|null","confidence":0-1,"reason":"..."}`

  const user = JSON.stringify({
    kind: input.kind,
    proposed_name: input.proposed_name,
    proposed_handle: input.proposed_handle,
    evidence: (input.evidence || '').slice(0, 400) || undefined,
    catalog_candidates: catalogOpts,
    pending_candidates: candOpts,
  })

  try {
    const raw = await textChatJson(system, user)
    const parsed = llmSchema.safeParse(extractJson(raw))
    if (!parsed.success) return null
    const d = parsed.data
    if (d.decision === 'novel' || d.confidence < 0.75) {
      return { action: 'novel' }
    }
    if (d.decision === 'duplicate_catalog' && d.match_id) {
      const hit = input.catalogHits.find((h) => h.id === d.match_id)
      if (!hit) return { action: 'novel' }
      return {
        action: 'merge_catalog',
        entity_id: hit.id,
        entity_name: hit.name,
        score: d.confidence,
        method: 'llm',
        reason: d.reason,
      }
    }
    if (d.decision === 'duplicate_candidate' && d.match_id) {
      const hit = input.candidateHits.find((h) => h.id === d.match_id)
      if (!hit) return { action: 'novel' }
      return {
        action: 'merge_candidate',
        candidate_id: hit.id,
        candidate_name: hit.name,
        score: d.confidence,
        method: 'llm',
        reason: d.reason,
      }
    }
    return { action: 'novel' }
  } catch (err) {
    console.warn(
      '[catalog-dedupe] llm failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/**
 * Decide whether a proposed sighting is novel or a duplicate.
 * @param useLlm — when false, only auto-merge on high cheap scores
 */
export async function evaluateCatalogCandidateDuplicate(opts: {
  kind: CatalogCandidateKind
  proposed_name: string
  proposed_handle?: string
  evidence_summary?: string
  identity_key?: string | null
  excludeCandidateId?: string
  useLlm?: boolean
}): Promise<DedupeDecision> {
  const handle = normalizeIgHandle(opts.proposed_handle || '') || null
  const name = opts.proposed_name.trim()
  const [catalog, pending] = await Promise.all([
    loadCatalogEntitiesForDedupe(),
    loadPendingCandidatesForDedupe(opts.kind),
  ])

  const catalogHits = rankAgainstCatalog(opts.kind, name, handle, catalog)
  const candidateHits = rankAgainstPending(
    opts.kind,
    name,
    handle,
    opts.identity_key ?? null,
    pending,
    opts.excludeCandidateId
  )

  const top = [...catalogHits, ...candidateHits].sort((a, b) => b.score - a.score)[0]
  if (top && top.score >= AUTO_MERGE_SCORE) {
    if (top.target === 'catalog') {
      return {
        action: 'merge_catalog',
        entity_id: top.id,
        entity_name: top.name,
        score: top.score,
        method: top.method,
        reason: `cheap match (${top.method}) score=${top.score.toFixed(2)}`,
      }
    }
    return {
      action: 'merge_candidate',
      candidate_id: top.id,
      candidate_name: top.name,
      score: top.score,
      method: top.method,
      reason: `cheap match (${top.method}) score=${top.score.toFixed(2)}`,
    }
  }

  const needsLlm =
    opts.useLlm !== false &&
    !!top &&
    top.score >= LLM_MIN_SCORE &&
    top.score < AUTO_MERGE_SCORE

  if (needsLlm) {
    const llm = await llmDecideDuplicate({
      kind: opts.kind,
      proposed_name: name,
      proposed_handle: handle,
      evidence: opts.evidence_summary,
      catalogHits,
      candidateHits,
    })
    if (llm) return llm
  }

  return { action: 'novel' }
}

export async function markCandidateMerged(opts: {
  id: string
  resolved_entity_id: string
  notes: string
  resolved_by?: string
}): Promise<void> {
  if (!isSupabaseStoreConfigured()) return
  const sb = getSupabaseStore()
  const now = new Date().toISOString()
  await sb
    .from('pipeline_catalog_candidates')
    .update({
      status: 'merged',
      resolved_entity_id: opts.resolved_entity_id,
      resolved_at: now,
      resolved_by: opts.resolved_by || 'catalog-dedupe',
      reviewer_notes: opts.notes.slice(0, 1000),
      updated_at: now,
    })
    .eq('id', opts.id)
    .eq('status', 'pending')
}

export async function bumpPendingCandidate(
  candidateId: string,
  sighting: {
    proposed_name?: string
    proposed_handle?: string | null
    evidence_summary?: string
    sample_source_url?: string
    sample_caption?: string
    sample_owner_username?: string
    sample_venue_name_raw?: string
    source_event_id?: string
    suggested_city?: string
  }
): Promise<void> {
  if (!isSupabaseStoreConfigured()) return
  const sb = getSupabaseStore()
  const { data: existing } = await sb
    .from('pipeline_catalog_candidates')
    .select('sighting_count')
    .eq('id', candidateId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!existing) return
  const now = new Date().toISOString()
  await sb
    .from('pipeline_catalog_candidates')
    .update({
      sighting_count: (existing.sighting_count ?? 1) + 1,
      last_seen_at: now,
      updated_at: now,
      ...(sighting.proposed_name ? { proposed_name: sighting.proposed_name } : {}),
      ...(sighting.proposed_handle !== undefined
        ? { proposed_handle: sighting.proposed_handle }
        : {}),
      ...(sighting.evidence_summary
        ? { evidence_summary: sighting.evidence_summary }
        : {}),
      ...(sighting.sample_source_url
        ? { sample_source_url: sighting.sample_source_url }
        : {}),
      ...(sighting.sample_caption
        ? { sample_caption: sighting.sample_caption.slice(0, 2000) }
        : {}),
      ...(sighting.sample_owner_username
        ? { sample_owner_username: sighting.sample_owner_username }
        : {}),
      ...(sighting.sample_venue_name_raw
        ? { sample_venue_name_raw: sighting.sample_venue_name_raw }
        : {}),
      ...(sighting.source_event_id
        ? { last_source_event_id: sighting.source_event_id }
        : {}),
      ...(sighting.suggested_city ? { suggested_city: sighting.suggested_city } : {}),
    })
    .eq('id', candidateId)
}

export type DedupeScanStats = {
  scanned: number
  merged_catalog: number
  merged_candidate: number
  novel: number
  errors: number
}

/** Batch-scan pending candidates; mark duplicates merged. */
export async function scanPendingCatalogCandidates(opts?: {
  limit?: number
  useLlm?: boolean
  dryRun?: boolean
}): Promise<DedupeScanStats> {
  const stats: DedupeScanStats = {
    scanned: 0,
    merged_catalog: 0,
    merged_candidate: 0,
    novel: 0,
    errors: 0,
  }
  if (!isSupabaseStoreConfigured()) return stats
  const sb = getSupabaseStore()
  const { data, error } = await sb
    .from('pipeline_catalog_candidates')
    .select(
      'id, kind, identity_key, proposed_name, proposed_handle, evidence_summary, sighting_count'
    )
    .eq('status', 'pending')
    .order('sighting_count', { ascending: false })
    .limit(opts?.limit ?? 200)

  if (error) {
    console.warn('[catalog-dedupe] scan load:', error.message)
    stats.errors++
    return stats
  }

  clearCatalogDedupeCache()

  for (const row of (data as Array<{
    id: string
    kind: CatalogCandidateKind
    identity_key: string
    proposed_name: string
    proposed_handle: string | null
    evidence_summary: string | null
  }>) || []) {
    stats.scanned++
    try {
      const decision = await evaluateCatalogCandidateDuplicate({
        kind: row.kind,
        proposed_name: row.proposed_name,
        proposed_handle: row.proposed_handle || undefined,
        evidence_summary: row.evidence_summary || undefined,
        identity_key: row.identity_key,
        excludeCandidateId: row.id,
        useLlm: opts?.useLlm !== false,
      })

      if (decision.action === 'novel') {
        stats.novel++
        continue
      }

      const notes =
        decision.action === 'merge_catalog'
          ? `auto-dedupe → catalog ${decision.entity_id} (${decision.entity_name}) [${decision.method} ${decision.score.toFixed(2)}] ${decision.reason}`
          : `auto-dedupe → candidate ${decision.candidate_id} (${decision.candidate_name}) [${decision.method} ${decision.score.toFixed(2)}] ${decision.reason}`

      console.log(`[catalog-dedupe] ${row.proposed_name}: ${notes}`)

      if (opts?.dryRun) {
        if (decision.action === 'merge_catalog') stats.merged_catalog++
        else stats.merged_candidate++
        continue
      }

      if (decision.action === 'merge_catalog') {
        await markCandidateMerged({
          id: row.id,
          resolved_entity_id: decision.entity_id,
          notes,
        })
        stats.merged_catalog++
      } else {
        await bumpPendingCandidate(decision.candidate_id, {
          proposed_name: row.proposed_name,
          evidence_summary: row.evidence_summary || undefined,
        })
        await markCandidateMerged({
          id: row.id,
          resolved_entity_id: decision.candidate_id,
          notes,
        })
        stats.merged_candidate++
      }
    } catch (err) {
      stats.errors++
      console.warn(
        '[catalog-dedupe] row failed:',
        row.id,
        err instanceof Error ? err.message : err
      )
    }
  }

  return stats
}
