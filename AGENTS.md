# Lisbon Events Calendar — AI context

Single entrypoint for understanding this codebase. Keep this file short; update "Where to find X" when adding major modules.

**Product name:** City Pager (UI brand). Repo/package may still use `lisbon-events-calendar`.

## Stack

- **Next.js 14** (App Router), TypeScript, Tailwind CSS
- **FullCalendar** for calendar views
- **Supabase** for auth, user profiles, social, and **pipeline store** (raw posts, AI tiers, review queue, runs)
- **NextAuth** (used alongside Supabase for some flows)
- **Google Sheets**: **Fontes IG - Venues / Promoters** (scrape + venue SoT), Venues/Promoters catalog, Processed Events (staging), **Events Clean New** (live); public calendar reads Clean CSV via `NEXT_PUBLIC_EVENTS_CSV_URL`

## Layers

| Layer | Path | Purpose |
|-------|------|---------|
| Pipeline | `pipeline/` (own package.json, run with tsx) | Scraping (Apify) + tiered AI → Supabase bulk store + Sheets Processed. Worker: `npm run worker`. See docs/PIPELINE.md |
| Admin | `src/app/admin/*`, `src/lib/admin*.ts` | CAF-style ops: Scrapers, Events Raw, Review, Processed (`ADMIN_EMAILS`) |
| Data | `src/data/loaders/*`, `src/data/schema/*`, `src/data/venueIndex.ts`, `src/data/canonicalVenues.ts` | Load and normalize CSV data; column mapping; venue/tag canonical lists |
| Adapter | `src/lib/eventsAdapter.ts` | Single facade: `fetchEvents`, `fetchVenues`, `fetchPromoters`, `filterEvents`; types `NormalizedEvent`, `VenueForDisplay` for UI |
| API | `src/app/api/*` | Thin route handlers; call `lib/` or `data/` only |
| Auth | `src/lib/auth*`, `src/lib/auth-config.ts`, `src/lib/supabase/*`, `src/lib/adminAuth.ts` | NextAuth + Supabase + admin allowlist |

## Where to find X

| Need | Location |
|------|----------|
| Events listing / fetch | `lib/eventsAdapter.ts` (fetchEvents), `data/loaders/eventsLoader.ts` |
| Calendar UI | `app/calendar/page.tsx`, `app/calendar/components/` (EventModal, EventListView, etc.) |
| Event actions (like, going, save, interested) | `lib/eventActions.ts`, `lib/userActions.ts` |
| Profile, social, friends | `lib/db/schema.ts` (types), `lib/profileApi.ts` (parse profile update body), `lib/friendRequests.ts`; profile UI in `app/profile/`, `components/Profile*`. See docs/FRIENDS_VS_FOLLOWS.md for friends vs follow distinction. |
| Venues / promoters pages | `app/venues/`, `app/promoters/`; data from `eventsAdapter` (fetchVenues, fetchPromoters) |
| Saved views, personas | `lib/savedViews.ts`, `lib/savedViewsSync.ts`; personas API under `app/api/personas/` |
| For You / recommendations | `app/api/foryou/route.ts`, `lib/recommendationEngine.ts` |
| Event scraping / AI extraction | `pipeline/` (CLI: scrape, extract, publish, worker, backfill); orchestration in `pipeline/process-post.ts` |
| IG sources (SoT) | Sheets **Fontes IG - Venues** + **Fontes IG - Promoters** → `readWatchlist` / `venue-resolve.ts` (combined Fontes IG is fallback) |
| Admin ops (scrapers / raw / review) | `/admin`, `lib/adminPipeline.ts`, `lib/googleSheets.ts`. Modes: `profile-images` (avatars), `scrape` (posts), `extract`, `verify`, `full` |
| Event review feedback | `lib/adminEventReviewFeedback.ts`, `app/api/admin/event-review/feedback/`, Supabase `event_review_feedback` |

## Docs

- **Setup and env checklist:** `docs/SETUP.md`
- **Friends vs follow distinction:** `docs/FRIENDS_VS_FOLLOWS.md`
- **CSV/schema contract:** `docs/SCHEMA.md`
- **Scraping + extraction pipeline runbook:** `docs/PIPELINE.md`
- **Features and phases:** `docs/MASTER_TASK_LIST_ARCHITECTURE.md`
