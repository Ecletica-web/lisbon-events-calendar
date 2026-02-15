# Lisbon Events Calendar — AI context

Single entrypoint for understanding this codebase. Keep this file short; update "Where to find X" when adding major modules.

## Stack

- **Next.js 14** (App Router), TypeScript, Tailwind CSS
- **FullCalendar** for calendar views
- **Supabase** for auth, user profiles, social (follows, likes, going, saved views, personas)
- **NextAuth** (used alongside Supabase for some flows)
- Events/venues/promoters data from **Google Sheets CSV** via env `NEXT_PUBLIC_EVENTS_CSV_URL`

## Layers

| Layer | Path | Purpose |
|-------|------|---------|
| Data | `src/data/loaders/*`, `src/data/schema/*`, `src/data/venueIndex.ts`, `src/data/canonicalVenues.ts` | Load and normalize CSV data; column mapping; venue/tag canonical lists |
| Adapter | `src/lib/eventsAdapter.ts` | Single facade: `fetchEvents`, `fetchVenues`, `fetchPromoters`, `filterEvents`; types `NormalizedEvent`, `VenueForDisplay` for UI |
| API | `src/app/api/*` | Thin route handlers; call `lib/` or `data/` only |
| Auth | `src/lib/auth*`, `src/lib/auth-config.ts`, `src/lib/supabase/*` | NextAuth + Supabase auth and session |

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

## Docs

- **Setup and env checklist:** `docs/SETUP.md`
- **Friends vs follow distinction:** `docs/FRIENDS_VS_FOLLOWS.md`
- **CSV/schema contract:** `docs/SCHEMA.md`
- **Features and phases:** `docs/MASTER_TASK_LIST_ARCHITECTURE.md`
