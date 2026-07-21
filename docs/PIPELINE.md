# Events Pipeline — runbook

CAF-style scraping + tiered AI extraction in `pipeline/`. Instagram via Apify →
tiered AI → validation. **Storage is split:**

| Store | What lives there |
|-------|------------------|
| **Google Sheets** | Fontes IG, Venues, Promoters, **Processed Events** — human-edited / inspected. Pipeline **reads** via public CSV; **writes high-confidence auto-pass events** when `PIPELINE_SHEETS_WRITE=1` + service account (default on). |
| **Supabase** | Raw posts, every AI tier artifact, review queue, verifications, run queue/log, scraper config, image buckets, **`venue_profile_images`** (IG pics for `/venues` when Sheets write fails) |

The Next.js app consumes the published Processed CSV and hosts `/admin`. Long jobs are
**queued** in Supabase and executed by a local **`npm run worker`** (not on Vercel).

## Architecture

```
Watchlist (Sheets CSV) ─→ Apify ─→ pipeline_posts (Supabase)
                                      │
                Tier 0–4 (+ OCR / Whisper) → pipeline_extractions
                                      │
                        merge + validate + venue resolve + dedupe
                                      │
              pass (high confidence) → Processed sheet (no human review)
              review/fail → pipeline_review_queue (Supabase) → Tier 6
                                      │
                        Tier 5 verify (always on extract/full unless --skip-verify)
                                      │
              clean verified → stay on Processed (no Tier 6)
              disputed / corrections → pipeline_review_queue → Tier 6
                                      │
                        Tier 6 → /admin/event-review
```

A **`full`** run (default in `/admin/scrapers`) does scrape → extract → Tier 5. Only low-confidence
extraction issues and unclean Tier 5 verifies need human review.

### Scrapers (separate modes)

| Mode | What it does |
|------|----------------|
| **`profile-images`** | Instagram profile pics for Fontes IG **venues + promoters** → Supabase storage/index (+ Sheets when API enabled) |
| **`scrape`** | Instagram **posts** only (no profile pics) |
| **`extract`** | AI tiers on pending posts (+ Tier 5 unless skipped) |
| **`verify`** | Tier 5 only |
| **`full`** | scrape posts → extract (+ Tier 5). Does **not** sync profile pics |

Queue from `/admin/scrapers` or CLI (`npm run profile-images`, `npm run scrape`, …).

### Venue / promoter profile pictures

`profile-images` run:

1. Apify profile details for venue + promoter handles
2. Archive into Supabase `venue-images` + `_index.json` / `venue_profile_images`
3. Best-effort write `Venues` / `Promoters` sheet `primary_image_url`

`/venues` and `/promoters` fill empty/placeholder images from that Supabase map by `instagram_handle`.

Admin can also enqueue runs via `/admin/scrapers` → `pipeline_runs` (status=`queued`)
→ worker polls and runs scrape/extract/verify/full/profile-images.

## Supabase tables (migration `019_pipeline_store.sql`)

| Table | Purpose |
|-------|---------|
| `pipeline_posts` | Scraped IG posts (`processing_status`: new / discarded / needs_review / processed) |
| `pipeline_extractions` | Per-tier artifacts: pre_filter, caption, vision, ocr, video_transcript, merge, validation |
| `pipeline_review_queue` | Needs-review items + Tier 5 context; `review_status` pending/approved/rejected |
| `pipeline_verifications` | Tier 5 audit (never auto-applies to Processed) |
| `pipeline_runs` | Job queue + ledger (queued → running → success/error/aborted) |
| `pipeline_config` | Scraper JSON config + `worker_heartbeat_at` |

## Sheet tabs (still used)

| Tab | Purpose |
|-----|---------|
| `Watchlist` / **`Fontes IG`** | IG sources. LEC uses tab **Fontes IG** (`Name`, `Handle / Website`, `Venue Type`, `Event Types`). Falls back to a legacy `Watchlist` tab if present. |
| `Processed Events` | Publishable events — edit in Sheets; calendar CSV source |

Legacy tabs (`Events_Raw`, `Needs_Review`, `Verification_Log`, `Run_Log`) are no longer
written by the pipeline; use `npm run backfill` once to migrate old rows into Supabase.

## Commands (run from `pipeline/`)

```bash
npm install                 # once
npm run scrape              # Watchlist → Apify → pipeline_posts (+ archive images)
npm run extract             # status=new posts → tiers → Processed (pass) / review queue + Tier 5
npm run verify              # Processed sheet → web search + LLM; write pipeline_verifications
npm run full                # scrape → extract (includes Tier 5 verify)
npm run worker              # poll pipeline_runs forever (keep running on a workstation)
npm run backfill            # one-off: Sheets legacy tabs → Supabase
npm run golden              # replay Testing CSVs (report only)

# Flags (after --):
#   --dry-run              skip remote writes where possible
#   --handle=lux           restrict to one watchlist handle
#   --limit=10             cap rows processed
#   --max-age-days=14      only posts newer than now−N days (combined with last scrape)
#   --force-vision         run vision even when caption has all mandatory fields
#   --skip-verify          skip online verify on extract/full
#   --skip-venue-images    skip IG profile pic → Venues.primary_image_url sync
#   --force-venue-images   overwrite existing venue-images URLs```

## Admin (`/admin`)

Requires Supabase login + email in `ADMIN_EMAILS`.

| Route | Role |
|-------|------|
| `/admin` | Hub counts + worker heartbeat |
| `/admin/scrapers` | Watchlist editor, queue runs, config JSON, run history / abort |
| `/admin/events-raw` | Browse `pipeline_posts` + tier trail drawer |
| `/admin/event-review` | Approve (→ Processed sheet) / reject review queue |
| `/admin/processed` | Read-only Processed sheet + link to edit in Sheets |

## Online verification (Tier 5) → Human review (Tier 6)

Tier 5 runs automatically after extract (and therefore on every `full` run) unless
`--skip-verify`. Suggestions only for field fixes; never auto-edits Processed.
Clean verifies stay published. Unclean verifies and soft validation failures queue
`pipeline_review_queue` for Tier 6 at `/admin/event-review`.

## Vision trigger (mandatory fields)

Caption extraction always runs. Vision runs **only** when caption is incomplete
(title, valid start_datetime, or venue). OCR and transcripts are persisted on
`pipeline_extractions` when those passes run.

## Setup

1. `cd pipeline && npm install`
2. Copy `pipeline/.env.example` → `pipeline/.env` (include `SUPABASE_URL` + service role).
3. Share the Google Sheet with the service account; set `GOOGLE_SHEETS_ID` (Watchlist + Processed).
4. Apply Supabase migrations through `020_venue_images_bucket.sql` (or re-run `SETUP_NEW_PROJECT.sql` on a new project).
5. App `.env.local`: same Sheets + Supabase keys, plus `ADMIN_EMAILS=you@example.com`.
6. Publish Processed Events as CSV → `NEXT_PUBLIC_EVENTS_CSV_URL`. Publish Venues CSV → `NEXT_PUBLIC_VENUES_CSV_URL`.
7. Start the worker: `cd pipeline && npm run worker`.

During **scrape** / **full**, the pipeline also fetches Instagram **profile pics** for Fontes IG handles typed as venues, stores them in the Supabase `venue-images` bucket, and writes the public URL into the Venues sheet `primary_image_url` (skips rows that already use `venue-images`). Disable with `--skip-venue-images` or uncheck “Sync venue profile pics” in `/admin/scrapers`.

## Env vars

| Var | Needed for |
|-----|-----------|
| `APIFY_API_TOKEN` | scrape (+ venue profile details) |
| `OPENAI_API_KEY` | text / Whisper / verify / vision fallback |
| `PROCESSING_VISION_PROVIDER`, `NVIDIA_NIM_API_KEY` | Nemotron VL |
| `DOCUMENT_AI_*` | optional OCR |
| `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | Fontes IG + Processed + Venues image updates |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | pipeline store + worker + image buckets |
| `EVENT_IMPORT_API_KEY`, `APP_BASE_URL` | persist-image (events + venue avatars) |
| `ADMIN_EMAILS` | (app) comma-separated admin allowlist |
| `NEXT_PUBLIC_VENUES_CSV_URL` | venue resolution + venue profile images in UI |

## Validation reason codes

`missing_title` / `missing_or_invalid_start_datetime` → **fail**;
`missing_venue_name_raw`, `venue_unresolved`, `low_confidence`,
`past_event`, `program_undersplit`, `online_verification_*` → **review**.

## Key modules

| Module | Role |
|--------|------|
| `pipeline/sinks/supabase-store.ts` | Posts, extractions, review, verify, runs |
| `pipeline/sinks/sheets-writer.ts` | Watchlist read + Processed append |
| `pipeline/process-post.ts` | Per-post tiers + persist extractions |
| `pipeline/cli/run.ts` | scrape / extract / verify / full |
| `pipeline/cli/worker.ts` | Job queue poller |
| `src/lib/adminPipeline.ts` | Admin data access |
| `src/lib/googleSheets.ts` | App-side Watchlist / Processed Sheets API |
| `src/lib/adminAuth.ts` | `ADMIN_EMAILS` gate |
