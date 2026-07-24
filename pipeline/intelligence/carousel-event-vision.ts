/**
 * Tier 3 — deep carousel vision. The highest-ROI pass: event dates for program
 * posts usually live on slides 2..N, not in the caption.
 *
 * Pipeline per post: resolve slides (Apify + embed fallback) → archive →
 * Document AI OCR per slide → Nemotron VL (chunks of 2 slides) with caption +
 * OCR context → merged events[] with source_slide_indices + on_slide_text_evidence.
 */

import { z } from 'zod'
import type { EventsRawRow, ExtractionResult, ExtractedEvent, PostPattern } from '../types'
import { resolveCarouselSlidesViaEmbed } from '../scrapers/embed-carousel-resolver'
import { archiveSlides, fetchImageAsBase64 } from '../media/media-archive'
import { ocrSlide, isDocAiEnabled, type SlideOcr } from './docai-ocr'
import { processingVisionChatMultimodal, extractJson, type VisionImage } from './vision-client'
import { extractedEventSchema } from './broad-event-extraction'

const SLIDES_PER_CHUNK = 2
const MAX_SLIDES = 10

const visionEventSchema = extractedEventSchema.extend({
  source_slide_indices: z.array(z.number()).default([]),
  on_slide_text_evidence: z.string().optional(),
})

const visionResponseSchema = z.object({
  events: z.array(visionEventSchema).default([]),
  post_pattern: z.enum(['single_event', 'multi_event', 'monthly_program', 'announcement', 'recap', 'not_event']).optional(),
  extraction_notes: z.string().optional(),
})

const SYSTEM_PROMPT = `You extract structured event data from Instagram carousel slides (event flyers, monthly programs) from Lisbon venues.

Rules:
- Timezone Europe/Lisbon. Output start_datetime/end_datetime as ISO 8601 with offset. Use posted_at as reference year: dates without a year are the next occurrence AFTER posted_at.
- Slides are numbered; you receive them in order with their index. A "monthly program" carousel typically has one event (or one day) per slide — output ONE entry per distinct event, never collapse a program into a single event.
- on_slide_text_evidence: quote VERBATIM the date/time text you read on the slide (e.g. "SEX 06 MAR · 23H"). This field is mandatory whenever you output start_datetime.
- source_slide_indices: which slide number(s) (1-based) the event was read from.
- OCR text for each slide may be provided — trust OCR for exact characters (dates, prices), trust the image for layout and association (which date belongs to which artist).
- Portuguese abbreviations: SEG/TER/QUA/QUI/SEX/SÁB/DOM are weekdays; months JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ; "H" or "h" marks the hour ("22H" = 22:00).
- Evidence-bound critical fields: start_datetime, end_datetime, venue_name_raw, price_min/price_max, is_free, ticket_url, age_restriction must be null/omitted unless EXACT evidence appears on the slide, OCR, or caption. Never invent or assume them.
- NEVER invent ticket URLs (no example.com, placeholders, or guessed domains). Only copy a URL visible on the slide/caption.
- NEVER assume typical club age (e.g. 18+) or typical cover price — omit when not printed.
- Prices: only when stated. "entrada livre"/"free"/"grátis" => is_free true. If price is unknown, leave is_free unset/null (NOT true) and note "unknown" — never mark free by default.
- venue_name_raw: as written on the flyer or caption; never invent.
- confidence_score reflects certainty about DATE and VENUE. Do not guess dates.
- If slides contain no attendable upcoming events, return {"events": []}.

Respond with JSON only:
{"events":[{"title","description_short","category","tags","start_datetime","end_datetime",
"venue_name_raw","price_min","price_max","currency","is_free","ticket_url","age_restriction",
"confidence_score","source_slide_indices","on_slide_text_evidence"}],
"post_pattern":"monthly_program|multi_event|single_event|announcement|recap|not_event",
"extraction_notes":"..."}`

export interface CarouselVisionInput {
  row: EventsRawRow
  /** When true, skip persist-image archival (e.g. golden-set replay) */
  skipArchive?: boolean
}

/** Resolve slide URLs: Apify data first, embed HTML fallback, single display URL last. */
export async function resolveSlideUrls(row: EventsRawRow): Promise<string[]> {
  const fromApify = row.carousel_slide_urls.split('|').map((s) => s.trim()).filter(Boolean)
  if (fromApify.length > 0) return fromApify.slice(0, MAX_SLIDES)

  const fromEmbed = await resolveCarouselSlidesViaEmbed(row.shortCode)
  if (fromEmbed.length > 0) return fromEmbed.slice(0, MAX_SLIDES)

  const single = row.stored_image_url || row.displayUrl || row.thumbnail_url
  return single ? [single] : []
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function carouselEventVision(input: CarouselVisionInput): Promise<ExtractionResult> {
  const { row } = input

  const slideUrls = await resolveSlideUrls(row)
  if (slideUrls.length === 0) {
    return { events: [], extraction_notes: 'no_slide_urls_resolved', raw_model_text: '' }
  }

  // Archive ephemeral CDN URLs; fall back to the original URL when archival fails
  let effectiveUrls = slideUrls
  if (!input.skipArchive) {
    const preArchived = row.archived_slide_urls.split('|').map((s) => s.trim()).filter(Boolean)
    const archived = preArchived.length === slideUrls.length ? preArchived : await archiveSlides(slideUrls, row.id)
    effectiveUrls = archived.map((url, i) => url || slideUrls[i])
  }

  // Download slides as base64 (works for both providers, avoids relay URLs)
  const images: { index: number; image: VisionImage }[] = []
  for (let i = 0; i < effectiveUrls.length; i++) {
    const fetched = await fetchImageAsBase64(effectiveUrls[i])
    if (fetched) images.push({ index: i + 1, image: fetched })
  }
  if (images.length === 0) {
    return { events: [], extraction_notes: 'slide_download_failed', raw_model_text: '' }
  }

  // OCR pass (optional)
  const ocrResults: SlideOcr[] = []
  if (isDocAiEnabled()) {
    for (const { index, image } of images) {
      const ocr = await ocrSlide(image.base64, image.mime, index)
      if (ocr) ocrResults.push(ocr)
    }
  }

  // Vision pass in chunks of 2 slides
  const allEvents: ExtractedEvent[] = []
  const rawTexts: string[] = []
  const notes: string[] = []
  let postPattern: PostPattern | undefined

  for (const group of chunk(images, SLIDES_PER_CHUNK)) {
    const slideIndices = group.map((g) => g.index)
    const ocrContext = ocrResults
      .filter((o) => slideIndices.includes(o.slide_index))
      .map((o) => `--- OCR slide ${o.slide_index} ---\n${o.full_text.slice(0, 2000)}`)
      .join('\n')

    const prompt = JSON.stringify({
      caption: row.caption.slice(0, 3000),
      owner_username: row.owner_username,
      location_name: row.location_name,
      posted_at: row.posted_at,
      slide_indices_in_this_request: slideIndices,
      total_slides: images.length,
      ocr_text: ocrContext || undefined,
    })

    try {
      const rawText = await processingVisionChatMultimodal(SYSTEM_PROMPT, prompt, group.map((g) => g.image))
      rawTexts.push(rawText)
      const parsed = visionResponseSchema.safeParse(extractJson<unknown>(rawText))
      if (!parsed.success) {
        notes.push(`vision_parse_error_slides_${slideIndices.join(',')}`)
        continue
      }
      if (parsed.data.post_pattern && !postPattern) postPattern = parsed.data.post_pattern
      if (parsed.data.extraction_notes) notes.push(parsed.data.extraction_notes)
      for (const e of parsed.data.events) {
        allEvents.push({
          ...e,
          price_min: e.price_min ?? undefined,
          price_max: e.price_max ?? undefined,
          tags: e.tags.slice(0, 5).map((t) => t.toLowerCase().trim()).filter(Boolean),
          source_slide_indices: e.source_slide_indices.length > 0 ? e.source_slide_indices : slideIndices,
          extraction_source: 'vision' as const,
        })
      }
    } catch (err) {
      notes.push(`vision_call_failed_slides_${slideIndices.join(',')}`)
      console.error(`[carousel-vision] chunk failed for ${row.id}:`, err instanceof Error ? err.message : err)
    }
  }

  // Same event announced across chunk boundaries: dedupe by title + start
  const seen = new Set<string>()
  const deduped = allEvents.filter((e) => {
    const key = `${e.title.toLowerCase().trim()}|${e.start_datetime ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    events: deduped,
    post_pattern: postPattern,
    extraction_notes: notes.join(' | ') || undefined,
    raw_model_text: rawTexts.join('\n---\n'),
    ocr_slides: ocrResults.length > 0 ? ocrResults : undefined,
  }
}
