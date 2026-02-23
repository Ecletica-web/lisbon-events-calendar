# Performance Guide

## What's Implemented Now

### Caching (5 minutes)

- **`fetchEvents()`** uses Next.js `unstable_cache` — first request fetches from Google Sheets and processes; subsequent requests within 5 min get cached data.
- **`/api/events`** and **`/api/filter-options`** have `revalidate = 300` so route responses can be cached.
- Reduces load on Google Sheets and CPU for parsing/deduplication.

### Adjusting Cache Duration

In `src/lib/eventsAdapter.ts`:

```ts
const EVENTS_REVALIDATE_SECONDS = 300  // Change to 60, 600, etc.
```

---

## Roadmap: Handling 500+ Events

When you grow beyond a few hundred events, consider these steps in order.

### 1. **Move Events to Supabase (high impact)**

Store events in a Supabase table instead of Google Sheets.

- **Pros**: Fast indexed queries, server-side filtering, pagination, no CSV parsing.
- **Migration**: Create an `events` table, sync from Sheets via a cron or manual script. Keep Sheets as the source of truth and sync periodically.
- **Effort**: Medium — new table, sync script, update `fetchEvents` to query Supabase.

### 2. **Server-Side Filtering & Pagination**

Stop returning the full events list to the client.

- **Add query params** to `/api/events`: `?start=2025-02-01&end=2025-02-28&tags=concert&limit=50`
- **Calendar**: Load only the visible month/week instead of all events.
- **Pros**: Smaller payloads, faster initial load.
- **Effort**: Medium — refactor calendar and API to support date ranges.

### 3. **Lazy Load Event Details**

For list/calendar views, return minimal fields (`id`, `title`, `start`, `venueName`, `category`). Load full details only when the user opens an event modal.

- **Pros**: Faster list rendering, less JSON over the wire.
- **Effort**: Low–medium — split into `listEvents` vs `getEventById`.

### 4. **Edge / CDN Caching**

If deploying on Vercel, use Edge Runtime or Edge caching for `/api/events` so responses are served from the edge.

- **Pros**: Lower latency for global users.
- **Effort**: Low — add `export const runtime = 'edge'` or configure Edge caching.

### 5. **Optimize Google Sheets (if staying with Sheets)**

- Use the **published CSV URL** (File → Share → Publish to web) for faster public access.
- Avoid very wide sheets — limit columns to what the app needs.
- Consider splitting into multiple sheets (e.g. events, venues) and fetching in parallel.
- Keep the sheet under ~10k rows for reasonable CSV size.

### 6. **Image Optimization**

- Use Next.js `<Image>` or a CDN for event images.
- Lazy load images below the fold.
- Consider smaller thumbnails for list views.

### 7. **Incremental Static Regeneration (ISR)**

For pages that can tolerate slight staleness, use ISR so events are pre-rendered and revalidated in the background.

---

## Quick Wins Checklist

- [x] 5‑minute cache on events (`unstable_cache`)
- [x] Route revalidation on API endpoints
- [ ] Move events to Supabase when you pass ~300 events
- [ ] Add date-range query params when you pass ~500 events
- [ ] Add pagination for venue/promoter list pages
- [ ] Optimize images with Next.js Image or CDN
