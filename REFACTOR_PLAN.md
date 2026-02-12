# Lisbon Events Calendar — Data Schema Refactor Plan

## 1. Current State Analysis

### A) What feeds the site today

| Source | Type | Env Var | File |
|--------|------|---------|------|
| Google Sheets (Events) | CSV via published URL | `NEXT_PUBLIC_EVENTS_CSV_URL` | Fetched in `eventsAdapter.ts` |
| Venues | Hardcoded | — | `src/data/canonicalVenues.ts` (CANONICAL_VENUES array) |

No venues CSV, no collections, no separate APIs.

### B) Where parsing happens

- **Primary**: `src/lib/eventsAdapter.ts`
  - `fetchEvents()` — fetches CSV, parses with Papa Parse, filters rows, normalizes, dedupes, caps per venue
  - `normalizeEvent(row)` — maps `RawEvent` → `NormalizedEvent` (internal, not exported)
  - `filterEvents()` — search, tags, venues, category, freeOnly, language, ageRestriction
- **Secondary**: `src/lib/events.ts` — older/simpler schema (`id`, `title`, `start_datetime`, `venue_name`, `tags`, `source_url`); **NOT used** by calendar (calendar imports `eventsAdapter`)

### C) Current Event shape

**RawEvent** (eventsAdapter):
- `event_id`, `title`, `description_short`, `description_long`, `start_datetime`, `end_datetime`, `timezone`, `is_all_day`, `opens_at`, `venue_name`, `venue_address`, `neighborhood`, `city`, `latitude`, `longitude`, `tags`, `category`, `price_min`, `price_max`, `currency`, `is_free`, `age_restriction`, `language`, `ticket_url`, `image_url`, `status`, `recurrence_rule`, `source_name`, `source_url`, `source_event_id`, `dedupe_key`, `confidence_score`, `last_seen_at`, `created_at`, `updated_at`

**NormalizedEvent** (FullCalendar-compatible):
- `id`, `title`, `start`, `end`, `allDay`
- `extendedProps`: venueName, venueAddress, venueKey (canonical), neighborhood, city, latitude, longitude, tags, category, priceMin, priceMax, currency, isFree, ageRestriction, language, ticketUrl, imageUrl, sourceName, sourceUrl, sourceEventId, confidenceScore, timezone, opensAt, recurrenceRule, lastSeenAt, createdAt, updatedAt, dedupeKey

**Missing in current**: `venue_id`, `primary_image_id`, `primary_image_url`, `image_credit`, `region`, `country`, `postal_code`, `_error`, `_raw_model_text`

**Current status handling**: Accepts `active`, `scheduled`, `needs_review`; filters out others (returns `null`).

### D) Current routing + pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `page.tsx` | Redirects to `/calendar` |
| `/calendar` | `calendar/page.tsx` | Main calendar with filters, FullCalendar, event modal |
| `/login`, `/signup`, `/profile` | — | Auth (feature-flagged) |
| **No** `/events/[id]` | — | Event detail only in modal |
| **No** `/venues` or `/venues/[slug]` | — | Venue filter uses canonical keys in sidebar |

### E) Current filtering / sorting logic

- **fetchEvents**: Filters rows with `event_id && title && start_datetime`; status in `active|scheduled|needs_review`; dedupes by dedupe_key → event_id → (title|start|venueKey); caps 15 events per venue.
- **filterEvents**: search (title, venue, tags, category); tags OR; venues OR; categories OR; freeOnly; language; ageRestriction.
- **Calendar**: Additional `excludeExhibitions`, `excludeContinuous` toggles.
- **Sorting**: By `start` date (parsed Date objects); cap-per-venue sorts by start then slices.

### F) Known brittle points

1. **Venue identity**: Uses fuzzy matching (venue_name, source_name → canonical key). No `venue_id`; multiple venues can collide on slug.
2. **Status**: Hardcoded allow-list; no support for `cancelled`, `postponed`, `sold_out`, `draft`, `archived`.
3. **Dual Event interfaces**: `events.ts` vs `eventsAdapter.ts`; only adapter used but both exist.
4. **Image field**: Uses `image_url`; new schema has `primary_image_url` + `primary_image_id`.
5. **No quarantine**: Bad rows are dropped entirely; no `_error` logging or quarantine.
6. **Datetime**: `new Date(row.start_datetime)` — assumes ISO; timezone used only for display, not parsing.

---

## 2. Target Data Model

### Event (domain object)

```ts
interface Event {
  event_id: string
  source_name?: string
  source_event_id?: string
  dedupe_key?: string
  title: string
  description_short?: string
  description_long?: string
  start_datetime: string  // ISO
  end_datetime?: string  // ISO
  timezone: string       // default Europe/Lisbon
  is_all_day: boolean
  status: 'scheduled' | 'cancelled' | 'postponed' | 'sold_out' | 'draft' | 'archived'
  venue_id?: string
  venue_name?: string
  venue_address?: string
  neighborhood?: string
  city?: string
  region?: string
  country?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  category?: string
  tags: string[]
  price_min?: number
  price_max?: number
  currency?: string
  is_free: boolean
  age_restriction?: string
  language?: string
  ticket_url?: string
  primary_image_id?: string
  primary_image_url?: string
  image_credit?: string
  source_url?: string
  confidence_score?: number
  last_seen_at?: string
  created_at?: string
  updated_at?: string
  _error?: string
}
```

### Venue (domain object)

```ts
interface Venue {
  venue_id: string
  venue_name: string
  venue_address?: string
  neighborhood?: string
  city?: string
  region?: string
  country?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  venue_url?: string
  instagram_url?: string
  tags: string[]
  created_at?: string
  updated_at?: string
  _error?: string
}
```

### Status rules

| Status | Default listing | Detail page (direct access) |
|--------|-----------------|-----------------------------|
| scheduled | ✓ | ✓ |
| sold_out | ✓ | ✓ |
| postponed | ✓ | ✓ |
| cancelled | ✗ | ✓ |
| draft | ✗ | ✗ (unless config) |
| archived | ✗ | ✓ |

---

## 3. Step-by-Step Plan

1. **Add domain models** (`src/models/Event.ts`, `src/models/Venue.ts`)
2. **Add data loaders** (`src/data/loaders/eventsLoader.ts`, `venuesLoader.ts`)
3. **Implement `normalizeEvent(raw)` and `normalizeVenue(raw)`** with safe defaults, `_error` logging, quarantine bad rows
4. **Add backward compatibility layer** — map old CSV columns (`id` → `event_id`, `image_url` → `primary_image_url`, etc.)
5. **Implement new status filtering** in loaders and adapter
6. **Dedupe strategy**: `event_id` → `dedupe_key` → `(title + start_datetime + venue_id)`
7. **Add `venue_id`** — Event references Venue via `venue_id`; fallback to `venue_name` if missing
8. **Add venues index + detail** (`/venues`, `/venues/[slug]`)
9. **Update eventsAdapter** to use new loaders/models, expose `NormalizedEvent` for FullCalendar (unchanged surface)
10. **Add optional collections** — models + parsing + helpers; no UI requirement
11. **Add env `NEXT_PUBLIC_VENUES_CSV_URL`** (optional); fallback to canonicalVenues
12. **Regression tests** — document routes and sanity-check script

---

## 4. Code Changes (Summary)

- `src/models/Event.ts` — new
- `src/models/Venue.ts` — new
- `src/models/Collection.ts` — new (optional)
- `src/data/loaders/eventsLoader.ts` — new
- `src/data/loaders/venuesLoader.ts` — new
- `src/data/loaders/collectionsLoader.ts` — new (optional)
- `src/lib/eventsAdapter.ts` — refactored to use loaders, new status rules, venue_id
- `src/app/venues/page.tsx` — new (venues index)
- `src/app/venues/[slug]/page.tsx` — new (venue detail)
- `env.example` — add `NEXT_PUBLIC_VENUES_CSV_URL`
- `REFACTOR_PLAN.md` — this file

---

## 5. Verification Checklist

Run `npm run dev` and verify:

- [ ] `/` redirects to `/calendar`
- [ ] `/calendar` loads, shows events (scheduled, sold_out, postponed)
- [ ] Search, tags, venues, categories, freeOnly filters work
- [ ] Event modal opens with full details
- [ ] URL state (q, cat, tag, venue, t) persists
- [ ] `/venues` lists venues with event counts
- [ ] `/venues/[slug]` shows venue + upcoming events
- [ ] Cancelled/archived events hidden from default list
- [ ] Draft events never visible (unless config)
- [ ] Old CSV (id, venue_name, image_url) still works
- [ ] Build succeeds (`npm run build` — may need to clear `.next` on Windows/OneDrive)

---

## 6. Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing CSV | Backward compat mapping (id→event_id, etc.) |
| Venue CSV missing | Fallback to canonicalVenues.ts |
| Bad rows crash build | Quarantine bad rows, log _error, continue |
| FullCalendar API change | Keep NormalizedEvent shape; adapters map from Event |
| Collections overkill | Implement as optional; UI hooks only if collections exist |

---

## 7. Refactor Completed (A–G)

### Done

- **A) Schema freeze**: `docs/SCHEMA.md`, `docs/VENUES.md`, `src/data/schema/eventColumns.ts`, `src/data/schema/venueColumns.ts`
- **B) Ledger-lite**: `first_seen_at`, `last_seen_at`, `changed_at`, `change_hash`, `source_count`, `sources` on Event; computed in eventsLoader
- **C) Venue identity + aliases**: Venue model with `slug`, `aliases`, `instagram_handle`; `VenueIndex`; `resolveVenue()`; venues CSV optional
- **D) Fingerprint dedupe**: `fingerprint` = hash(title_norm|date|time|venue_id); dedupe by fingerprint, pick best row, merge sources
- **E) Calendar page split**: `EventModal.tsx`, `EventListView.tsx` extracted; orphan code removed
- **F) Trust/freshness cues**: Event modal shows status label + source link; calendar page shows "Last updated" (max `last_seen_at`)
- **G) Quarantine + sanity-check**: Quarantine includes `reason`; `/api/sanity-check` returns stats + `quarantinedByReason`; `npm run sanity-check` prints (requires dev server)

### Left / Optional

- Further split: `FiltersPanel.tsx`, `CalendarView.tsx`, `useViewState.ts`, `useEventsData.ts`, `MobileCards.tsx` (page is still large but functional)
- `getAllVenues()` could merge venues from CSV + canonicalVenues for richer filter list
