/**
 * Tier 1 — broad caption extraction. Text-only pass over the caption + metadata,
 * with strict Zod-validated JSON output matching the docs/SCHEMA.md contract.
 */

import { z } from 'zod'
import type { EventsRawRow, ExtractionResult, ExtractedEvent } from '../types'
import { textChatJson, extractJson } from './vision-client'

export const extractedEventSchema = z.object({
  title: z.string().min(1),
  description_short: z.string().optional(),
  description_long: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  start_datetime: z.string().optional(),
  end_datetime: z.string().optional(),
  venue_name_raw: z.string().optional(),
  price_min: z.number().nullish(),
  price_max: z.number().nullish(),
  currency: z.string().optional(),
  is_free: z.boolean().nullish(),
  ticket_url: z.string().optional(),
  age_restriction: z.string().optional(),
  confidence_score: z.number().min(0).max(1),
})

export const extractionResponseSchema = z.object({
  events: z.array(extractedEventSchema).default([]),
  extraction_notes: z.string().optional(),
})

const SYSTEM_PROMPT = `You extract structured event data from Instagram captions posted by Lisbon venues and promoters.

Rules:
- Timezone is Europe/Lisbon. Output datetimes as ISO 8601 WITH offset (e.g. "2026-02-28T22:00:00+00:00"; Lisbon is UTC+0 in winter, UTC+1 in summer / late Mar-late Oct).
- Use posted_at as the reference for resolving relative or partial dates. Events are in the FUTURE relative to posted_at: if a date like "28 de Fevereiro" has no year, pick the next occurrence after posted_at.
- Portuguese date formats you must handle: "28 de Fevereiro", "sáb 14 jun", "sexta-feira, 6 de Março", "06.03", "6/3", "dia 15", "quinta às 22h", "22h30", "das 18h às 02h". Month names: janeiro, fevereiro, março, abril, maio, junho, julho, agosto, setembro, outubro, novembro, dezembro. Weekdays: segunda, terça, quarta, quinta, sexta, sábado, domingo.
- Recurring patterns ("todas as quintas") without a concrete date: extract the NEXT single occurrence after posted_at and note the recurrence in extraction_notes.
- One caption can announce MULTIPLE events (line-ups across days, program posts): output one entry per distinct event.
- Evidence-bound critical fields: start_datetime, end_datetime, venue_name_raw, price_min/price_max, is_free, ticket_url, age_restriction must be null/omitted unless EXACT evidence appears in the caption (or provided metadata for venue). Never invent or assume them.
- NEVER invent ticket URLs (no example.com, placeholders, or guessed domains). Only copy a URL that appears in the caption/links.
- NEVER assume typical club age (e.g. 18+) or typical cover price — omit age_restriction and prices when not stated.
- Prices: only when stated. "entrada livre"/"free"/"grátis" => is_free true. "10€" => price_min 10, currency "EUR". "10-15€" => min 10 max 15. If price is unknown, leave is_free unset/null (NOT true) and note "unknown" in extraction_notes — never mark free by default.
- venue_name_raw: the venue as written in the caption; if absent use location_name from metadata; never invent one.
- category: one lowercase word (music, nightlife, art, culture, food, market, workshop, theatre, cinema, sports, community).
- tags: up to 5 lowercase tags (genre, vibe, e.g. "techno", "jazz", "open air").
- confidence_score reflects how certain you are about the DATE and VENUE specifically. If no explicit date exists in the caption, either omit start_datetime or set confidence below 0.5 — never guess a date.
- If the caption announces no attendable upcoming event, return {"events": []}.

Respond with JSON only:
{"events":[{"title","description_short","description_long","category","tags",
"start_datetime","end_datetime","venue_name_raw","price_min","price_max","currency",
"is_free","ticket_url","age_restriction","confidence_score"}],"extraction_notes":"..."}`

export async function broadEventExtraction(row: EventsRawRow): Promise<ExtractionResult> {
  const user = JSON.stringify({
    caption: row.caption.slice(0, 6000),
    owner_username: row.owner_username,
    owner_full_name: row.owner_full_name,
    location_name: row.location_name,
    posted_at: row.posted_at,
    hashtags: row.hashtags,
    external_links: row.external_links,
  })

  const rawText = await textChatJson(SYSTEM_PROMPT, user)
  const parsed = extractJson<unknown>(rawText)
  const result = extractionResponseSchema.safeParse(parsed)

  if (!result.success) {
    return { events: [], extraction_notes: `broad_parse_error: ${result.error.message.slice(0, 200)}`, raw_model_text: rawText }
  }

  const events: ExtractedEvent[] = result.data.events.map((e) => ({
    ...e,
    price_min: e.price_min ?? undefined,
    price_max: e.price_max ?? undefined,
    tags: e.tags.slice(0, 5).map((t) => t.toLowerCase().trim()).filter(Boolean),
    extraction_source: 'caption' as const,
  }))

  return { events, extraction_notes: result.data.extraction_notes, raw_model_text: rawText }
}

/** Highest event confidence in a broad pass (0 when no events). */
export function maxConfidence(result: ExtractionResult): number {
  return result.events.reduce((max, e) => Math.max(max, e.confidence_score), 0)
}
