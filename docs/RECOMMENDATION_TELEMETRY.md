# Recommendation telemetry

Non-ML foundation for City Pager For You behavioural data collection.

## Purpose

Capture **versioned, session-scoped recommendation telemetry** so we can later answer:

- Which events were shown, in which session, at which position?
- Which algorithm version produced the ranking?
- Why (score breakdown + candidate sources)?
- Which cards were genuinely visible?
- What actions followed an impression?

**Production ranking remains the existing rule-based engine** (`rules_v1`). This patch does not train models, change weights, or alter feed order.

## Architecture

```
/api/foryou
  → score events (recommendationEngine)
  → create recommendation_sessions (best-effort)
  → return events + additive recommendationItems / session fields

For You UI
  → genuine active-card impression (≥1s) → POST /api/recommendations/impressions
  → actions (like/save/…) → existing user_interactions (SoT)
  → secondary → POST /api/recommendations/events
```

Server module: `src/lib/recommendationTelemetry.ts` (service-role writes).  
Client helper: `src/lib/recommendationTelemetryClient.ts` (never blocks UI).

## Feature flag

| Variable | Default | Effect |
|----------|---------|--------|
| `RECOMMENDATION_TELEMETRY_ENABLED` | unset / false | No sessions, no inserts; feed still works; API returns `telemetryEnabled: false` |
| `NEXT_PUBLIC_ENABLE_RECOMMENDATION_HIDE` | false | Optional Hide control on For You (telemetry only; no ranking effect) |

Client behaviour follows the API’s `telemetryEnabled` field (no public telemetry env required).

## Algorithm version

Canonical constant:

```ts
RECOMMENDATION_ALGORITHM_VERSION = "rules_v1"
```

Defined once in `src/lib/recommendationEngine.ts`. Returned from `/api/foryou`, stored on sessions and events.

## Tables

### `recommendation_sessions`

One row per For You feed response (when telemetry enabled).

- `user_id` nullable (anonymous allowed)
- `persona_id` text (personas are file-backed — **no FK**)
- `surface` (e.g. `foryou`)
- `algorithm_version`
- `context` jsonb (timezone / hour / weekday / persona prefs already known — never fabricated)

### `recommendation_events`

Append-only behavioural log. Actions:

`impression`, `open`, `like`, `unlike`, `save`, `unsave`, `going`, `cancel_going`, `interested`, `calendar_add`, `ticket_click`, `share`, `pass`, `hide`

Partial unique index: one `impression` per `(session_id, event_id)`.

**RLS enabled; no public policies.** Writes only via server routes using the service role.

### View `ml_training_examples_v1`

One row per impression with **separate** future outcome flags (`opened_24h`, `liked_7d`, …). Outcomes only count actions **after** the impression. Not exposed via public APIs.

## Impression definition (For You swipe)

- Only the **active** card may qualify.
- Background / peek cards never count.
- Timer starts when the card becomes active; cancelled if the user swipes away before ~1s.
- Client dedup: `Set<\`${sessionId}:${eventId}\`>`.
- DB unique index is the final guard.

## Candidate sources

Attributed only when the underlying signal matched:

`followed_venue`, `followed_promoter`, `persona_match`, `friend_activity`, `saved_tag`, `liked_category`, `free_preference`, `cold_start`, `rules`

Cold-start (no personalization signals) uses random upcoming sampling — unchanged — tagged `cold_start`.

## Score breakdowns

Additive components summing to the final score (weights unchanged):

| Field | Weight |
|-------|--------|
| followedVenue | 10 |
| followedPromoter | 8 |
| personaMatch | 6 |
| energyBoost | 2 (high energy only) |
| friendGoing | 5 |
| savedTag | 4 |
| likedCategory | 3 |
| freePreference | 2 |

## API

### `GET /api/foryou` (additive fields)

Existing: `events`, `reasons`.

Added:

- `recommendationSessionId` (uuid or null)
- `algorithmVersion`
- `telemetryEnabled`
- `recommendationItems[]` — position, score, scoreBreakdown, candidateSources, reasons per event

Telemetry failure never causes a 500 for the feed.

### `POST /api/recommendations/impressions`

Batch impressions (max 50). Rejects client-supplied `user_id`. Session ownership checked server-side. Rate-limited ~120/min per user or IP.

### `POST /api/recommendations/events`

Contextual action telemetry after primary product actions succeed.

## Failure behaviour

- Telemetry errors are logged and swallowed.
- Feed load, like/save/going/open/ticket/calendar continue regardless.
- Disabled flag → normal recommendations, `telemetryEnabled: false`.

## Privacy

- No public read of raw telemetry.
- No IP / user-agent storage in telemetry metadata.
- No event descriptions or private profile blobs in metadata.
- Coarse location only if already available (rounded).
- Retention: plan periodic deletion or archival of `recommendation_events` older than a product-chosen window (e.g. 12–24 months) before any ML use; not automated in this patch.

## Validating data (Stage C checklist)

1. Impression volume ≈ active card dwells, not feed length.
2. Position starts at 1 and matches swipe order.
3. `algorithm_version` always `rules_v1` until a new engine ships.
4. Actions after impressions join cleanly in `ml_training_examples_v1`.
5. Duplicate impression rate near zero (unique index).
6. Filter bots / internal testers before training.

## Rollout

- **Stage A (local):** `RECOMMENDATION_TELEMETRY_ENABLED=true` + apply migration `023`.
- **Stage B (prod shadow):** enable flag; ranking unchanged; monitor insert errors, latency, storage.
- **Stage C:** data-quality validation only — **no ML in this patch**.

## Explicitly not implemented

- Machine-learning training, embeddings, vector search
- Collaborative filtering / neural recommenders
- Automated model deployment / ML ranking
- A/B testing infrastructure
- Production use of `pass` / `hide` to change ranking
- Changes to current recommendation weights

## Analytics SQL

See [RECOMMENDATION_ANALYTICS.sql](./RECOMMENDATION_ANALYTICS.sql).

## Migration rollback

```sql
DROP VIEW IF EXISTS public.ml_training_examples_v1;
DROP TABLE IF EXISTS public.recommendation_events;
DROP TABLE IF EXISTS public.recommendation_sessions;
```
