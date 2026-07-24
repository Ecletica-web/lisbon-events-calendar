# City Pager — AI & human context (replication entrypoint)

Single entrypoint for understanding and **replicating** this codebase. Keep the
"Where to find X" table current when adding major modules.

**Agents / Cursor:** This file is the short map. For depth, **always open** the matching
doc under `docs/replication/` (or the live runbook in `docs/`) before inventing
architecture. Rule: `.cursor/rules/project-knowledge.mdc` (alwaysApply).

**Product (UI brand):** City Pager / Pager  
**Repo / package:** `lisbon-events-calendar` / `lisbon-events-calendar-site`

**Replication pack (shareable):** `docs/replication/` — five PDFs under
`docs/replication/pdf/` plus Markdown sources. Start with PDF 05 (bootstrap) and
this file. Index: `docs/replication/README.md`.

| PDF | Topic |
|-----|--------|
| `01-Visao-e-Arquitectura.pdf` | Product vision + system architecture |
| `02-Pipeline-e-Inteligencia.pdf` | Scrapers, AI tiers 0–6, worker |
| `03-Dados-Sheets-Supabase.pdf` | Sheets tabs, CSV contract, Supabase |
| `04-Produto-Social-Reco-UX.pdf` | Features, friends, For You, UX |
| `05-Guia-Replicacao.pdf` | End-to-end setup checklist |

Regenerate PDFs: `python scripts/md-to-replication-pdfs.py`

---

## One-paragraph essence

Instagram watchlist (Google Sheets **Fontes IG**) → Apify scrape → tiered AI
extraction in `pipeline/` → high-confidence rows to **Processed Events**,
low-confidence to Supabase review → human Tier 6 → `publish` to **Events Clean
New** CSV → Next.js calendar + For You. Supabase holds auth, social, and all
pipeline artifacts; Sheets remain the human-editable calendar SoT.

---

## Stack

| Layer | Tech |
|-------|------|
| App | Next.js 14 App Router, TypeScript, Tailwind, FullCalendar |
| Auth | **Supabase Auth** (primary); NextAuth fallback if Supabase unset |
| User/social/pipeline DB | Supabase Postgres + Storage + RLS |
| Public events | Published Google Sheets CSV (`NEXT_PUBLIC_EVENTS_CSV_URL`) |
| Ingestion | `pipeline/` (own package, `tsx`); Apify + OpenAI + optional NIM vision / Whisper / DocAI |
| Long jobs | Local `npm run worker` polling `pipeline_runs` (**not** on Vercel) |

---

## Architecture layers

| Layer | Path | Purpose |
|-------|------|---------|
| Pipeline | `pipeline/` | Scrape (Apify) + tiers → Supabase bulk store + Sheets Processed; worker |
| Admin | `src/app/admin/*`, `src/lib/admin*.ts` | Scrapers, Events Raw, Review, Processed (`ADMIN_EMAILS`) |
| Data | `src/data/loaders/*`, `src/data/schema/*`, `venueIndex.ts` | CSV → normalized domain; column maps; venue resolve |
| Adapter | `src/lib/eventsAdapter.ts` | Facade: `fetchEvents` / venues / promoters / `filterEvents`; `NormalizedEvent` |
| API | `src/app/api/*` | Thin handlers → `lib/` or `data/` only |
| Auth | `src/lib/auth*`, `supabase/*`, `adminAuth.ts` | Supabase + NextAuth + admin allowlist |
| Reco | `src/lib/recommendationEngine.ts` | For You scoring |
| Social | `src/lib/interactions.ts`, `friendRequests.ts` | Actions + friends |

**Project rule:** no heavy business logic in route files; put it in `lib/` or `data/`.

---

## End-to-end data flow

```
Fontes IG Venues/Promoters → Apify → pipeline_posts
         → Tier 0–4 + merge + validate + venue + dedupe
         → pass → Processed Events (Sheets)
         → review/fail → pipeline_review_queue → /admin/event-review (Tier 6)
         → Tier 5 verify (suggestions only; unclean → review)
         → npm run publish → Events Clean New CSV → app loaders → UI
```

Modes: `profile-images` | `scrape` | `extract` | `verify` | `full` | `publish`.  
`full` = scrape + extract (+ Tier 5); does **not** sync profile pics.

---

## AI extraction (intelligence)

| Tier | Module | Role |
|------|--------|------|
| 0 | `intelligence/pre-filter.ts` | Keep/discard; `post_pattern` |
| 1 | `intelligence/broad-event-extraction.ts` | Caption → structured events |
| 3 | `intelligence/carousel-event-vision.ts` | Image/carousel vision (+ OCR) |
| 4 | `intelligence/video-event-extraction.ts` | Frames + Whisper |
| merge | `intelligence/merge-extractions.ts` | Caption ↔ vision |
| validate | `qualification/validate-event.ts` | pass / review / fail (conf ≥ ~0.7) |
| 5 | `intelligence/event-verification.ts` | Web verify; never auto-edits Processed |
| 6 | Admin UI | Human approve/reject → Processed |

Vision runs only if caption lacks title, valid start, or venue (or `--force-vision`).  
Models: text `gpt-4o-mini`; vision Nemotron VL → `gpt-4o`; verify `gpt-4o` + Brave optional.

Orchestrator: `pipeline/process-post.ts`.

---

## Storage split

| Store | Holds |
|-------|-------|
| Sheets Fontes IG | Watchlist + venue-resolve SoT for handles |
| Sheets Venues/Promoters | Catalog + `primary_image_url` |
| Sheets Processed | Staging (auto-pass + approved) |
| Sheets Events Clean New | Live calendar feed |
| Supabase pipeline_* | Posts, extractions, review, verifications, runs, config |
| Supabase user_* | Profiles, interactions, friends, chats |
| Buckets | `event-images`, `venue-images`, profile assets |

CSV column contract: `docs/SCHEMA.md`. Pipeline runbook: `docs/PIPELINE.md`.

---

## Product surfaces

| Route | Role |
|-------|------|
| `/` | Landing (City Pager brand) |
| `/calendar` | Main discovery (FullCalendar + filters + modal) |
| `/foryou` | Swipe feed (`/api/foryou` + recommendation engine) |
| `/venues`, `/promoters` | Catalog + follow |
| `/profile`, `/u/[id]` | Own / public profile |
| `/chat` | Friends DMs/groups |
| `/onboarding` | Tags / vibe personas → prefs |
| `/v/[slug]`, `/p/[slug]` | Shared saved view / persona |
| `/admin/*` | Ops hub |

**Social model:** mutual **friends** (`friend_requests`); **follow venues/promoters** are private discovery prefs; **no** user-to-user followers. See `docs/FRIENDS_VS_FOLLOWS.md`.

**For You weights (approx):** followed venue +10, promoter +8, persona +6, friend going +5, saved tag +4, liked category +3, free +2; cold start = random upcoming.

**UX:** IBM Plex Mono + Press Start 2P; day/night B&W pager tokens in `globals.css`; admin uses separate slate ops chrome.

---

## Where to find X

| Need | Location |
|------|----------|
| Events listing / fetch | `lib/eventsAdapter.ts`, `data/loaders/eventsLoader.ts` |
| Calendar UI | `app/calendar/page.tsx`, `app/calendar/components/` |
| Event actions | `lib/eventActions.ts`, `lib/userActions.ts`, `lib/interactions.ts` |
| Profile / friends | `lib/friendRequests.ts`, `lib/profileApi.ts`, `app/profile/`, `components/Profile*` |
| Venues / promoters | `app/venues/`, `app/promoters/`; adapter fetch* |
| Saved views / personas | `lib/savedViews.ts`, `lib/viewState.ts`, `app/api/personas/`, `app/api/saved-views/` |
| For You | `app/api/foryou/route.ts`, `lib/recommendationEngine.ts` |
| Recommendation telemetry | `lib/recommendationTelemetry.ts`, `docs/RECOMMENDATION_TELEMETRY.md`, migration `023` |
| Scraping / AI | `pipeline/` (`process-post.ts`, `cli/run.ts`, `cli/worker.ts`) |
| IG sources SoT | Fontes IG tabs → `readWatchlist` / `venue-resolve.ts` |
| Admin ops | `/admin`, `lib/adminPipeline.ts`, `lib/googleSheets.ts` |
| Review feedback | `lib/adminEventReviewFeedback.ts`, `event_review_feedback` |
| Env / migrations | `docs/SETUP.md`, `supabase/migrations/` (001→022) |
| Replication PDFs | `docs/replication/pdf/` |

---

## Bootstrap (short)

1. `npm install` + `cd pipeline && npm install`
2. Sheet + SA + published Clean/Venues CSV URLs
3. Supabase migrations 001→022; set app + pipeline env
4. `npm run dev` + `cd pipeline && npm run worker`
5. `profile-images` / `full` / `publish` → open `/calendar` and `/admin`

Full checklist: `docs/replication/05-guia-replicacao.md` (and its PDF).

---

## Docs index

| Doc | Topic |
|-----|--------|
| `docs/SETUP.md` | Env + migrations |
| `docs/PIPELINE.md` | Scrape/extract/verify/publish/worker |
| `docs/SCHEMA.md` | Event/venue/promoter CSV contract |
| `docs/FRIENDS_VS_FOLLOWS.md` | Friends vs venue follows |
| `docs/RECOMMENDATION_TELEMETRY.md` | For You telemetry (non-ML); analytics SQL companion |
| `docs/VENUES.md` | Venue identity / index |
| `docs/MASTER_TASK_LIST_ARCHITECTURE.md` | Roadmap (mix of done + planned) |
| `docs/replication/*` | Shareable replication pack (MD + PDF) |
