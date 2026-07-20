/**
 * Per-post orchestrator — runs the intelligence tiers over one Events_Raw row
 * and routes extracted events to Processed / Needs_Review rows.
 *
 * Tier flow:
 *   Tier 0 pre-filter → discard | continue
 *   Tier 1 broad caption extraction (always when kept)
 *   Tier 3/4 vision ONLY when caption is missing mandatory fields
 *     (title, start_datetime, venue) — not merely because media is a carousel
 *   Merge → validate → venue resolve → fingerprint
 *
 * When `postDbId` is set, each tier artifact is persisted to `pipeline_extractions`.
 */

import type {
  EventsRawRow,
  ExtractedEvent,
  ExtractionResult,
  NeedsReviewRow,
  PostPattern,
  ProcessedEventRow,
} from './types'
import { preFilterPost, shouldDiscard } from './intelligence/pre-filter'
import { broadEventExtraction } from './intelligence/broad-event-extraction'
import { carouselEventVision } from './intelligence/carousel-event-vision'
import { videoEventExtraction, isVideoPassEnabled } from './intelligence/video-event-extraction'
import { mergeExtractions } from './intelligence/merge-extractions'
import { validateEvent } from './qualification/validate-event'
import { resolveEventVenue } from './qualification/venue-resolve'
import { computeFingerprint } from './qualification/dedupe'
import { visionTriggerReason } from './qualification/mandatory-fields'
import { getConfig } from './config'
import {
  insertExtraction,
  updatePostProcessingStatus,
  type ProcessingStatus,
} from './sinks/supabase-store'

export interface ProcessPostOptions {
  /** Skip persist-image archival (golden replays, dry experiments) */
  skipArchive?: boolean
  /** Override "now" for past_event validation (golden replays of historic data) */
  now?: Date
  /** Force-run the vision tier regardless of triggers */
  forceVision?: boolean
  /** Supabase pipeline_posts.id — enables per-tier artifact persistence */
  postDbId?: string
  dryRun?: boolean
}

export interface ProcessPostResult {
  discarded: boolean
  discardReason?: string
  post_pattern?: PostPattern
  processed: ProcessedEventRow[]
  needsReview: NeedsReviewRow[]
  tiersRun: string[]
  /** Merged event candidates before routing (useful for reporting) */
  events: ExtractedEvent[]
  finalStatus?: ProcessingStatus
}

const nowIso = () => new Date().toISOString()

function makeEventId(row: EventsRawRow, index: number): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `evt_${stamp}_${row.shortCode || row.id}_${index}`
}

function toNeedsReviewRow(
  row: EventsRawRow,
  event: ExtractedEvent | null,
  status: string,
  reasons: string[],
  rawModelText: string
): NeedsReviewRow {
  return {
    review_id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    source_name: row.source_name,
    source_event_id: row.source_event_id,
    source_url: row.source_url,
    owner_username: row.owner_username,
    caption: row.caption,
    description_short: event?.description_short ?? event?.title ?? '',
    description_long: event?.description_long ?? '',
    validation_status: status,
    validation_reasons: reasons.join('|'),
    confidence_score: event ? String(event.confidence_score) : '',
    start_datetime: event?.start_datetime ?? '',
    venue_name_raw: event?.venue_name_raw ?? row.location_name ?? '',
    route: 'needs_review',
    _raw_caption_ai_text: event ? JSON.stringify(event) : '',
    raw_model_text: rawModelText.slice(0, 40000),
    created_at: nowIso(),
    thumbnail_url: row.thumbnail_url,
    stored_image_url: row.stored_image_url,
    image_storage_path: row.image_storage_path,
    image_error: row.image_error,
    verification_verdict: '',
    verification_notes: '',
    verification_sources: '',
    suggested_corrections: '',
  }
}

async function persistTier(
  options: ProcessPostOptions,
  tier: Parameters<typeof insertExtraction>[0]['tier'],
  payload: { model?: string; parsedJson?: unknown; rawModelText?: string }
): Promise<void> {
  if (!options.postDbId) return
  await insertExtraction({
    postId: options.postDbId,
    tier,
    model: payload.model,
    parsedJson: payload.parsedJson,
    rawModelText: payload.rawModelText,
    dryRun: options.dryRun,
  })
}

export async function processPost(
  row: EventsRawRow,
  options: ProcessPostOptions = {}
): Promise<ProcessPostResult> {
  const tiersRun: string[] = []
  const cfg = getConfig()

  // Tier 0
  tiersRun.push('pre_filter')
  const gate = await preFilterPost(row)
  await persistTier(options, 'pre_filter', {
    model: cfg.PIPELINE_TEXT_MODEL,
    parsedJson: {
      is_event_post: gate.is_event_post,
      confidence: gate.confidence,
      post_pattern: gate.post_pattern,
      reason: gate.reason,
    },
    rawModelText: gate.raw_model_text,
  })

  if (shouldDiscard(gate)) {
    if (options.postDbId) {
      await updatePostProcessingStatus(options.postDbId, 'discarded', options.dryRun)
    }
    return {
      discarded: true,
      discardReason: `${gate.post_pattern}${gate.reason ? `: ${gate.reason}` : ''}`,
      post_pattern: gate.post_pattern,
      processed: [],
      needsReview: [],
      tiersRun,
      events: [],
      finalStatus: 'discarded',
    }
  }

  // Tier 1
  tiersRun.push('broad_llm')
  const broad = await broadEventExtraction(row)
  await persistTier(options, 'caption', {
    model: cfg.PIPELINE_TEXT_MODEL,
    parsedJson: {
      events: broad.events,
      post_pattern: broad.post_pattern,
      extraction_notes: broad.extraction_notes,
    },
    rawModelText: broad.raw_model_text,
  })

  // Vision only when caption lacks mandatory fields (title, start_datetime, venue)
  let vision: ExtractionResult | null = null
  const whyVision = visionTriggerReason(broad, row, options.forceVision)

  if (whyVision) {
    if (row.media_type === 'video') {
      if (isVideoPassEnabled()) {
        tiersRun.push('video_vision')
        vision = await videoEventExtraction(row)
      } else {
        tiersRun.push(`vision_skipped_video_disabled:${whyVision}`)
      }
    } else {
      tiersRun.push(`carousel_vision:${whyVision}`)
      vision = await carouselEventVision({ row, skipArchive: options.skipArchive })
    }
  }

  if (vision) {
    if (vision.ocr_slides) {
      await persistTier(options, 'ocr', {
        parsedJson: vision.ocr_slides,
      })
    }
    if (vision.video_transcript) {
      await persistTier(options, 'video_transcript', {
        model: 'whisper-1',
        rawModelText: vision.video_transcript,
      })
    }
    await persistTier(options, 'vision', {
      model:
        cfg.PROCESSING_VISION_PROVIDER === 'nvidia'
          ? cfg.PROCESSING_VISION_NVIDIA_MODEL
          : cfg.PROCESSING_VISION_OPENAI_MODEL,
      parsedJson: {
        events: vision.events,
        post_pattern: vision.post_pattern,
        extraction_notes: vision.extraction_notes,
      },
      rawModelText: vision.raw_model_text,
    })
  }

  // Merge
  const merged = mergeExtractions(broad, vision)
  const postPattern = vision?.post_pattern ?? gate.post_pattern
  const combinedRawText = [broad.raw_model_text, vision?.raw_model_text]
    .filter(Boolean)
    .join('\n===VISION===\n')

  await persistTier(options, 'merge', {
    parsedJson: { events: merged, post_pattern: postPattern },
  })

  if (merged.length === 0) {
    await persistTier(options, 'validation', {
      parsedJson: { status: 'fail', reasons: ['no_events_extracted'] },
    })
    if (options.postDbId) {
      await updatePostProcessingStatus(options.postDbId, 'needs_review', options.dryRun)
    }
    return {
      discarded: false,
      post_pattern: postPattern,
      processed: [],
      needsReview: [toNeedsReviewRow(row, null, 'fail', ['no_events_extracted'], combinedRawText)],
      tiersRun,
      events: [],
      finalStatus: 'needs_review',
    }
  }

  // Validate + route each event
  const processed: ProcessedEventRow[] = []
  const needsReview: NeedsReviewRow[] = []
  const validationArtifacts: unknown[] = []

  for (let i = 0; i < merged.length; i++) {
    const event = merged[i]
    const venue = await resolveEventVenue(event.venue_name_raw, row.location_name, row.owner_username)
    // Auto-fill venue_name_raw from IG location when the model found none
    if (!event.venue_name_raw && venue.venue_name_raw) event.venue_name_raw = venue.venue_name_raw

    const validation = validateEvent(event, {
      post_pattern: postPattern,
      events_in_post: merged.length,
      venueResolved: venue.resolved,
      now: options.now,
    })
    validationArtifacts.push({
      title: event.title,
      status: validation.status,
      reasons: validation.reasons,
      venue_resolved: venue.resolved,
      venue_id: venue.resolved ? venue.venue_id : null,
    })

    if (validation.status !== 'pass') {
      needsReview.push(toNeedsReviewRow(row, event, validation.status, validation.reasons, combinedRawText))
      continue
    }

    const fingerprint = computeFingerprint(event.title, event.start_datetime!, venue.resolved ? venue.venue_id : 'unknown')
    const timestamp = nowIso()
    processed.push({
      event_id: makeEventId(row, i),
      source_name: row.owner_username || row.source_name,
      source_event_id: row.source_event_id,
      sources: row.owner_username || row.source_name,
      source_count: '1',
      source_url: row.source_url,
      dedupe_key: '',
      fingerprint,
      title: event.title,
      description_short: event.description_short ?? '',
      description_long: event.description_long ?? '',
      start_datetime: event.start_datetime!,
      end_datetime: event.end_datetime ?? '',
      timezone: 'Europe/Lisbon',
      is_all_day: 'false',
      status: 'scheduled',
      venue_id: venue.resolved ? venue.venue_id : '',
      venue_name: venue.resolved ? venue.venue_name : '',
      venue_name_raw: event.venue_name_raw ?? '',
      venue_address: '',
      neighborhood: '',
      city: 'Lisboa',
      country: 'Portugal',
      latitude: row.latitude,
      longitude: row.longitude,
      category: event.category ?? '',
      tags: event.tags.join('|'),
      price_min: event.price_min != null ? String(event.price_min) : '',
      price_max: event.price_max != null ? String(event.price_max) : '',
      currency: event.currency ?? (event.price_min != null ? 'EUR' : ''),
      is_free: event.is_free != null ? String(event.is_free) : '',
      age_restriction: event.age_restriction ?? '',
      language: '',
      ticket_url: event.ticket_url ?? '',
      primary_image_url: row.stored_image_url || row.thumbnail_url,
      confidence_score: String(event.confidence_score),
      first_seen_at: timestamp,
      last_seen_at: timestamp,
      changed_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
      _raw_model_text: combinedRawText.slice(0, 40000),
      post_pattern: postPattern ?? '',
      extraction_source: event.extraction_source,
      on_slide_text_evidence: event.on_slide_text_evidence ?? '',
    })
  }

  await persistTier(options, 'validation', { parsedJson: validationArtifacts })

  const finalStatus: ProcessingStatus =
    processed.length > 0 && needsReview.length === 0
      ? 'processed'
      : needsReview.length > 0
        ? 'needs_review'
        : 'processed'

  if (options.postDbId) {
    // If any event passed, mark processed; if only review, mark needs_review
    const status: ProcessingStatus = processed.length > 0 ? 'processed' : 'needs_review'
    await updatePostProcessingStatus(options.postDbId, status, options.dryRun)
  }

  return {
    discarded: false,
    post_pattern: postPattern,
    processed,
    needsReview,
    tiersRun,
    events: merged,
    finalStatus,
  }
}
