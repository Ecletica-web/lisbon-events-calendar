/**
 * Pipeline configuration — loads and validates env vars with zod.
 * Reads pipeline/.env (falls back to repo root .env.local for shared keys).
 */

import * as path from 'path'
import * as dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: path.join(__dirname, '.env') })
// Prefer repo-root .env.local for shared keys (overrides empty placeholders in pipeline/.env)
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const boolFlag = z
  .string()
  .optional()
  .transform((v) => v === '1' || v?.toLowerCase() === 'true')

const configSchema = z.object({
  // Scraping — dedicated actors (posts vs profile pics)
  APIFY_API_TOKEN: z.string().optional(),
  /** @deprecated Prefer APIFY_INSTAGRAM_POST_ACTOR_ID; kept as fallback alias */
  APIFY_INSTAGRAM_ACTOR_ID: z.string().optional(),
  /** apify/instagram-post-scraper — posts only */
  APIFY_INSTAGRAM_POST_ACTOR_ID: z.string().default('nH2AHrwxeTRJoN5hX'),
  /** apify/instagram-profile-scraper — avatars / bio */
  APIFY_INSTAGRAM_PROFILE_ACTOR_ID: z.string().default('dSCLg0C3YEZ83HzYX'),
  PIPELINE_RUN_MODE: z.enum(['per_account', 'batch']).default('batch'),
  PIPELINE_MAX_POSTS_PER_ACCOUNT: z.coerce.number().default(20),

  // Text LLM + Whisper
  OPENAI_API_KEY: z.string().optional(),
  PIPELINE_TEXT_MODEL: z.string().default('gpt-4o-mini'),
  PIPELINE_VERIFY_MODEL: z.string().default('gpt-4o'),

  // Online verification search (optional; OpenAI web_search used when absent)
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  /** @deprecated Extract always runs Tier 5 unless --skip-verify. Kept for env compatibility. */
  PIPELINE_VERIFY_ON_EXTRACT: boolFlag,

  // Vision
  PROCESSING_VISION_PROVIDER: z.enum(['openai', 'nvidia']).default('nvidia'),
  NVIDIA_NIM_API_KEY: z.string().optional(),
  PROCESSING_VISION_NVIDIA_MODEL: z.string().default('nvidia/nemotron-nano-12b-v2-vl'),
  PROCESSING_VISION_OPENAI_MODEL: z.string().default('gpt-4o'),

  // Document AI OCR
  DOCUMENT_AI_ENABLED: boolFlag,
  DOCUMENT_AI_PROJECT_ID: z.string().optional(),
  DOCUMENT_AI_LOCATION: z.string().default('eu'),
  DOCUMENT_AI_PROCESSOR_ID: z.string().optional(),
  DOCUMENT_AI_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // Google Sheets — reads via public CSV or service account; writes optional
  GOOGLE_SHEETS_ID: z.string().optional(),
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /** When 1/true, append high-confidence events to Processed (needs service account). Default on when unset. */
  PIPELINE_SHEETS_WRITE: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return true
      return v === '1' || v.toLowerCase() === 'true'
    }),

  // Supabase pipeline store (raw posts, extractions, review, verify, runs)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // App bridge (persist-image)
  EVENT_IMPORT_API_KEY: z.string().optional(),
  APP_BASE_URL: z.string().default('http://localhost:3000'),

  // Media enrichment
  INSTAGRAM_EMBED_CAROUSEL_FETCH: boolFlag,
  PIPELINE_VIDEO_WHISPER: boolFlag,
  PIPELINE_VIDEO_FRAMES: boolFlag,

  // Venue index source (same CSVs the app uses)
  NEXT_PUBLIC_VENUES_CSV_URL: z.string().optional(),

  // Thresholds
  PIPELINE_BROAD_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.7),
  PIPELINE_MERGE_CAPTION_DATETIME_THRESHOLD: z.coerce.number().default(0.8),
  PIPELINE_PUBLISH_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.7),
})

export type PipelineConfig = z.infer<typeof configSchema>

let cached: PipelineConfig | null = null

export function getConfig(): PipelineConfig {
  if (!cached) {
    cached = configSchema.parse(process.env)
  }
  return cached
}

/** Assert that a config key is present, with a friendly error naming the feature. */
export function requireConfig<K extends keyof PipelineConfig>(key: K, feature: string): NonNullable<PipelineConfig[K]> {
  const value = getConfig()[key]
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing env var ${String(key)} — required for ${feature}. See pipeline/.env.example`)
  }
  return value as NonNullable<PipelineConfig[K]>
}
