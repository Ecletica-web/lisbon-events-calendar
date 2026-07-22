/**
 * Tier 5 — online event verification (suggestions only).
 *
 * Searches the web for each processed event and proposes an accuracy verdict +
 * optional field corrections. Nothing is auto-applied: Tier 6 (human review)
 * decides what to accept.
 *
 * Search providers (first available wins):
 *   1. Brave Search API  (BRAVE_SEARCH_API_KEY)
 *   2. OpenAI Responses API with web_search tool (OPENAI_API_KEY)
 */

import { z } from 'zod'
import { getConfig, requireConfig } from '../config'
import type { ProcessedEventRow, VerificationLogRow } from '../types'
import { extractJson, textChatJson } from './vision-client'

export type VerificationVerdict = 'verified' | 'disputed' | 'not_found' | 'inconclusive'

export interface SuggestedCorrections {
  title?: string
  start_datetime?: string
  end_datetime?: string
  venue_name_raw?: string
  status?: string
  ticket_url?: string
}

export interface VerificationResult {
  event_id: string
  title: string
  verdict: VerificationVerdict
  /** 0–1 confidence in the verdict */
  confidence: number
  field_checks: {
    title_ok: boolean | null
    datetime_ok: boolean | null
    venue_ok: boolean | null
  }
  notes: string
  /** Suggested field overrides for a human to accept/reject — never auto-applied */
  suggested_corrections: SuggestedCorrections
  sources: string
  raw_model_text: string
  verified_at: string
}

interface SearchHit {
  title: string
  url: string
  snippet: string
}

const suggestedCorrectionsSchema = z
  .object({
    title: z.string().optional(),
    start_datetime: z.string().optional(),
    end_datetime: z.string().optional(),
    venue_name_raw: z.string().optional(),
    status: z.string().optional(),
    ticket_url: z.string().optional(),
  })
  .default({})

/** Models often return "0.8" / "true" / null-as-string — coerce before strict checks. */
const looseConfidence = z.preprocess((v) => {
  if (typeof v === 'string') {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : v
  }
  return v
}, z.number())
  .transform((n) => {
    // Allow 0–100 percentages from the model
    const scaled = n > 1 && n <= 100 ? n / 100 : n
    return Math.min(1, Math.max(0, scaled))
  })

const looseBoolNull = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', 'yes', '1', 'ok'].includes(s)) return true
    if (['false', 'no', '0'].includes(s)) return false
    if (['null', 'unknown', 'n/a', 'na'].includes(s)) return null
  }
  return v
}, z.boolean().nullable())

const verificationSchema = z.object({
  verdict: z.enum(['verified', 'disputed', 'not_found', 'inconclusive']),
  confidence: looseConfidence,
  title_ok: looseBoolNull,
  datetime_ok: looseBoolNull,
  venue_ok: looseBoolNull,
  notes: z.preprocess((v) => (v == null ? '' : String(v)), z.string()),
  source_urls: z
    .preprocess((v) => {
      if (v == null) return []
      if (typeof v === 'string') return v.split(/[\s|,]+/).filter(Boolean)
      return v
    }, z.array(z.string()))
    .default([]),
  suggested_corrections: suggestedCorrectionsSchema,
})

const REVIEW_SYSTEM = `You are Tier 5 of an events pipeline: online fact-check suggestions for a HUMAN reviewer (Tier 6).

You do NOT publish or correct anything yourself. You only propose a verdict and optional field corrections.

Given a claimed Lisbon event and web search evidence, decide:

- "verified": independent sources confirm the event with matching title (or clear alias),
  date (±1 day ok), and venue (or alias). Leave suggested_corrections empty unless a minor fix helps.
- "disputed": sources contradict date/venue, show cancellation, or a clearly different event.
  Put the corrected values in suggested_corrections when you can infer them.
- "not_found": no relevant independent mention (Instagram-only is not enough).
- "inconclusive": mixed/weak evidence.

Rules:
- Instagram or the same source_url alone does NOT count as independent verification.
- suggested_corrections must only include fields you would change; omit unchanged fields.
- status suggestions: only "cancelled" or "postponed" when sources clearly say so.
- Datetimes: ISO 8601 with Europe/Lisbon offset when suggesting a new start/end.

Respond with JSON only (confidence must be a JSON number 0–1, not a string; booleans true/false/null):
{"verdict","confidence","title_ok","datetime_ok","venue_ok","notes","source_urls":["..."],
"suggested_corrections":{"title?","start_datetime?","end_datetime?","venue_name_raw?","status?","ticket_url?"}}`

async function searchBrave(query: string): Promise<SearchHit[]> {
  const key = getConfig().BRAVE_SEARCH_API_KEY
  if (!key) return []
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  })
  if (!res.ok) {
    console.error(`[verify] Brave search failed: ${res.status}`)
    return []
  }
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] }
  }
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.description ?? '',
  }))
}

async function openaiWebReview(event: ProcessedEventRow): Promise<{ text: string; urls: string[] }> {
  const cfg = getConfig()
  const input = [
    REVIEW_SYSTEM,
    '',
    'Claimed event:',
    JSON.stringify({
      title: event.title,
      start_datetime: event.start_datetime,
      end_datetime: event.end_datetime,
      venue: event.venue_name || event.venue_name_raw,
      city: event.city || 'Lisboa',
      ticket_url: event.ticket_url,
      source_url: event.source_url,
      source_name: event.source_name,
    }),
    '',
    'Search the web for this event in Lisbon / Portugal. Prefer venue sites, ticketing (Blueticket, Bol, Dice, Resident Advisor), and reputable listings. Then return the JSON verdict + suggested_corrections for a human reviewer.',
  ].join('\n')

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireConfig('OPENAI_API_KEY', 'online event verification')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.PIPELINE_VERIFY_MODEL || 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      input,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI web verify failed ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    output_text?: string
    output?: { type?: string; content?: { type?: string; text?: string }[]; url?: string }[]
  }

  let text = data.output_text ?? ''
  const urls: string[] = []
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === 'output_text' && c.text) text += c.text
        }
      }
      if (typeof item.url === 'string') urls.push(item.url)
    }
  }
  return { text, urls }
}

function buildSearchQuery(event: ProcessedEventRow): string {
  const venue = event.venue_name || event.venue_name_raw
  const date = event.start_datetime.slice(0, 10)
  return `${event.title} ${venue} Lisboa ${date}`.trim()
}

export async function verifyProcessedEvent(event: ProcessedEventRow): Promise<VerificationResult> {
  const verifiedAt = new Date().toISOString()
  const cfg = getConfig()

  let rawText = ''
  let hits: SearchHit[] = []

  if (cfg.BRAVE_SEARCH_API_KEY) {
    hits = await searchBrave(buildSearchQuery(event))
    rawText = await textChatJson(
      REVIEW_SYSTEM,
      JSON.stringify({
        claimed_event: {
          title: event.title,
          start_datetime: event.start_datetime,
          venue: event.venue_name || event.venue_name_raw,
          city: event.city || 'Lisboa',
          ticket_url: event.ticket_url,
          source_url: event.source_url,
        },
        search_results: hits,
      })
    )
  } else {
    const review = await openaiWebReview(event)
    rawText = review.text
    hits = review.urls.map((url) => ({ title: '', url, snippet: '' }))
  }

  const parsed = verificationSchema.safeParse(extractJson<unknown>(rawText))
  if (!parsed.success) {
    return {
      event_id: event.event_id,
      title: event.title,
      verdict: 'inconclusive',
      confidence: 0.3,
      field_checks: { title_ok: null, datetime_ok: null, venue_ok: null },
      notes: `verify_parse_error: ${parsed.error.message.slice(0, 160)}`,
      suggested_corrections: {},
      sources: hits.map((h) => h.url).filter(Boolean).join('|'),
      raw_model_text: rawText,
      verified_at: verifiedAt,
    }
  }

  const sources = Array.from(
    new Set([...parsed.data.source_urls, ...hits.map((h) => h.url)].filter(Boolean))
  ).join('|')

  return {
    event_id: event.event_id,
    title: event.title,
    verdict: parsed.data.verdict,
    confidence: parsed.data.confidence,
    field_checks: {
      title_ok: parsed.data.title_ok,
      datetime_ok: parsed.data.datetime_ok,
      venue_ok: parsed.data.venue_ok,
    },
    notes: parsed.data.notes,
    suggested_corrections: parsed.data.suggested_corrections ?? {},
    sources,
    raw_model_text: rawText,
    verified_at: verifiedAt,
  }
}

export function toVerificationLogRow(
  event: ProcessedEventRow,
  result: VerificationResult
): VerificationLogRow {
  return {
    event_id: event.event_id,
    title: event.title,
    start_datetime: event.start_datetime,
    venue_name: event.venue_name || event.venue_name_raw,
    source_url: event.source_url,
    verdict: result.verdict,
    confidence: String(result.confidence),
    title_ok: result.field_checks.title_ok == null ? '' : String(result.field_checks.title_ok),
    datetime_ok: result.field_checks.datetime_ok == null ? '' : String(result.field_checks.datetime_ok),
    venue_ok: result.field_checks.venue_ok == null ? '' : String(result.field_checks.venue_ok),
    notes: result.notes,
    suggested_corrections: JSON.stringify(result.suggested_corrections ?? {}),
    sources: result.sources,
    verified_at: result.verified_at,
    raw_model_text: result.raw_model_text.slice(0, 40000),
  }
}

/** Tier 6 queue: anything that is not a clean verify, or that proposes field changes. */
export function needsHumanReview(result: VerificationResult): boolean {
  if (result.verdict !== 'verified') return true
  return Object.keys(result.suggested_corrections ?? {}).length > 0
}
