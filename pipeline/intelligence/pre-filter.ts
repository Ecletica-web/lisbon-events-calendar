/**
 * Tier 0 — event relevance gate. Cheap deterministic checks first, then a small
 * text-LLM classification. Stops AI spend on memes, recaps and non-event posts.
 */

import { z } from 'zod'
import type { EventsRawRow, PreFilterResult, PostPattern } from '../types'
import { textChatJson, extractJson } from './vision-client'

const MIN_CAPTION_LENGTH = 20

const preFilterSchema = z.object({
  is_event_post: z.boolean(),
  confidence: z.number().min(0).max(1),
  post_pattern: z.enum(['single_event', 'multi_event', 'monthly_program', 'announcement', 'recap', 'not_event']),
  reason: z.string().optional(),
})

const SYSTEM_PROMPT = `You classify Instagram posts from Lisbon venues and event promoters.
Decide whether the post announces one or more UPCOMING events that people can attend.

post_pattern values:
- "single_event": announces exactly one upcoming event
- "multi_event": announces several distinct upcoming events in one post
- "monthly_program": a weekly/monthly program or agenda (dates usually on carousel slides, not caption)
- "announcement": venue news, lineup teaser without date, ticket sale opening
- "recap": photos/thanks about a PAST event
- "not_event": memes, merchandise, unrelated content

Captions are usually Portuguese or English. Respond with JSON only:
{"is_event_post": boolean, "confidence": 0-1, "post_pattern": "...", "reason": "short justification"}`

/** Deterministic gates that skip the LLM entirely. */
export function deterministicPreGate(row: EventsRawRow): PreFilterResult | null {
  const caption = (row.caption ?? '').trim()
  // Carousels can carry all info on slides — never discard on caption length alone
  if (caption.length < MIN_CAPTION_LENGTH && row.media_type !== 'carousel') {
    return {
      is_event_post: false,
      confidence: 0.9,
      post_pattern: 'not_event',
      reason: 'caption_too_short',
      raw_model_text: '',
    }
  }
  return null
}

export async function preFilterPost(row: EventsRawRow): Promise<PreFilterResult> {
  const gated = deterministicPreGate(row)
  if (gated) return gated

  const user = JSON.stringify({
    owner_username: row.owner_username,
    caption: row.caption.slice(0, 3000),
    hashtags: row.hashtags,
    media_type: row.media_type,
    posted_at: row.posted_at,
    location_name: row.location_name,
  })

  const rawText = await textChatJson(SYSTEM_PROMPT, user)
  const parsed = extractJson<unknown>(rawText)
  const result = preFilterSchema.safeParse(parsed)

  if (!result.success) {
    // Unparseable classifier output: err on the side of keeping the post
    return {
      is_event_post: true,
      confidence: 0.5,
      post_pattern: 'single_event' as PostPattern,
      reason: 'prefilter_parse_error',
      raw_model_text: rawText,
    }
  }
  return { ...result.data, raw_model_text: rawText }
}

/** Routing decision based on the pre-filter result. */
export function shouldDiscard(result: PreFilterResult): boolean {
  return !result.is_event_post || result.post_pattern === 'recap' || result.post_pattern === 'not_event'
}

export function requiresCarouselVision(result: PreFilterResult): boolean {
  return result.post_pattern === 'monthly_program'
}
