# Events Pipeline — runbook

CAF-style scraping + tiered AI extraction in `pipeline/`. Instagram via Apify →
tiered AI → validation. **Storage is split:**

| Store | What lives there |
|-------|------------------|
| **Google Sheets** | `Watchlist`, `Processed Events` (human-editable; calendar publishes Processed CSV) |
| **Supabase** | Raw posts, every AI tier artifact, review queue, verifications, run queue/log, scraper config |

The Next.js app consumes the published Processed CSV and hosts `/admin` (Scrapers,
Events Raw, Review, Processed). Long jobs are **queued** in Supabase and executed by
a local **`npm run worker`** (not on Vercel).

## Architecture

```
Watchlist (Sheets) ─→ Apify ─→ pipeline_posts (Supabase)
                                      │
                Tier 0–4 (+ OCR / Whisper) → pipeline_extractions
                                      │
                        merge + validate + venue resolve + dedupe
                                      │
              pass → Processed Events (Sheets, status=scheduled)
              review/fail → pipeline_review_queue (Supabase)
                                      │
                        Tier 5 verify → pipeline_verifications
                                      │ (suggestions only; may re-queue review)
                        Tier 6 → /admin/event-review (approve → Sheets)
```

Admin can also enqueue runs via `/admin/scrapers` → `pipeline_runs` (status=`queued`)
→ worker polls and runs scrape/extract/verify/full.

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
npm run extract             # status=new posts → tiers → review queue / Processed sheet
npm run verify              # Processed sheet → web search + LLM; write pipeline_verifications
npm run full                # scrape → extract → verify
npm run worker              # poll pipeline_runs forever (keep running on a workstation)
npm run backfill            # one-off: Sheets legacy tabs → Supabase
npm run golden              # replay Testing CSVs (report only)

# Flags (after --):
#   --dry-run        skip remote writes where possible
#   --handle=lux     restrict to one watchlist handle
#   --limit=10       cap rows processed
#   --force-vision   run vision even when caption has all mandatory fields
#   --skip-verify    skip online verify on extract/full
```

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

Same behaviour as before: suggestions only; never auto-edits Processed. Queues
`pipeline_review_queue` when not a clean verify. Tier 6 is `/admin/event-review`.

## Vision trigger (mandatory fields)

Caption extraction always runs. Vision runs **only** when caption is incomplete
(title, valid start_datetime, or venue). OCR and transcripts are persisted on
`pipeline_extractions` when those passes run.

## Setup

1. `cd pipeline && npm install`
2. Copy `pipeline/.env.example` → `pipeline/.env` (include `SUPABASE_URL` + service role).
3. Share the Google Sheet with the service account; set `GOOGLE_SHEETS_ID` (Watchlist + Processed).
4. Apply Supabase migrations through `019_pipeline_store.sql`.
5. App `.env.local`: same Sheets + Supabase keys, plus `ADMIN_EMAILS=you@example.com`.
6. Publish Processed Events as CSV → `NEXT_PUBLIC_EVENTS_CSV_URL`.
7. Start the worker: `cd pipeline && npm run worker`.

## Env vars

| Var | Needed for |
|-----|-----------|
| `APIFY_API_TOKEN` | scrape |
| `OPENAI_API_KEY` | text / Whisper / verify / vision fallback |
| `PROCESSING_VISION_PROVIDER`, `NVIDIA_NIM_API_KEY` | Nemotron VL |
| `DOCUMENT_AI_*` | optional OCR |
| `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | Watchlist + Processed |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | pipeline store + worker |
| `EVENT_IMPORT_API_KEY`, `APP_BASE_URL` | persist-image |
| `ADMIN_EMAILS` | (app) comma-separated admin allowlist |
| `NEXT_PUBLIC_VENUES_CSV_URL` | venue resolution |

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
