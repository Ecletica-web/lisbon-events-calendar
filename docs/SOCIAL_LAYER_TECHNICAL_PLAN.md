# Lisbon Events Calendar — Social Layer Technical Plan

> **Status:** PLANNING — Awaiting approval before implementation  
> **No publishing, deployment, or production push until approved.**

---

## 1. Architecture Overview

### 1.1 Current State (Baseline)

- **Auth:** Supabase Auth (email/password, OAuth) when configured; NextAuth fallback when not
- **Database:** Supabase PostgreSQL with RLS
- **Existing tables:**
  - `user_profiles` (id, email, name)
  - `user_follow_venues`
  - `user_follow_promoters`
  - `user_wishlist_events` (conceptual “Saved”)
  - `user_like_events`
- **Events:** External (CSV/Google Sheets); `event_id` = stable string ID
- **No:** user-to-user follows, subscriptions, reminders, Going/Interested, favorites, notification queue

### 1.2 Target Architecture

- **Private, identity-based planning engine** — no public feed, no ratings, no comments
- **Approval-based follows** — only approved followers see Going/Interested and Favorites
- **Subscription layer** — venues, promoters, tags; triggers notifications
- **Event interaction states** — Going, Interested, Saved, Reminder (and optional Went later)

---

## 2. Database Structure

### 2.1 New & Modified Tables

#### `user_profiles` (extend existing)

| Column         | Type         | Constraints                    | Description                      |
|----------------|--------------|--------------------------------|----------------------------------|
| id             | UUID         | PK, FK auth.users              | (existing)                       |
| email          | TEXT         |                                | (existing)                       |
| name           | TEXT         |                                | (existing)                       |
| display_name   | TEXT         |                                | User-chosen display name         |
| avatar_url     | TEXT         |                                | Profile picture URL              |
| bio            | TEXT         | max 160 chars                  | Short bio                        |
| location       | TEXT         |                                | Optional location                |
| social_link    | TEXT         |                                | Optional URL                     |
| private_mode   | BOOLEAN      | DEFAULT false                  | Hide all activity from followers |
| created_at     | TIMESTAMPTZ  | DEFAULT NOW()                  | (existing)                       |
| updated_at     | TIMESTAMPTZ  | DEFAULT NOW()                  | (existing)                       |

---

#### `event_user_actions` (new — replaces separate wishlist/like where needed)

One row per user+event+action type. Actions are independent.

| Column      | Type        | Constraints                           | Description      |
|-------------|-------------|----------------------------------------|------------------|
| id          | UUID        | PK, DEFAULT gen_random_uuid()          |                  |
| user_id     | UUID        | NOT NULL, FK auth.users ON DELETE CASCADE |                  |
| event_id    | TEXT        | NOT NULL                              | Matches event.id |
| action_type | TEXT        | NOT NULL, CHECK IN ('going','interested','saved','reminder','went') | Enum-like        |
| reminder_at | TIMESTAMPTZ | NULL                                  | When to notify (for action_type='reminder') |
| reminder_hours_before | INT | NULL, DEFAULT 24                       | Fallback hours before event |
| created_at  | TIMESTAMPTZ | DEFAULT NOW()                          |                  |
| updated_at  | TIMESTAMPTZ | DEFAULT NOW()                          |                  |
| UNIQUE(user_id, event_id, action_type)   |             | One action per type per user per event |                  |

**Indexes:**
- `(user_id, action_type)` — “my going events”
- `(event_id, action_type)` — counts for event page
- `(user_id, event_id)` — quick user-event lookup

**Migration path:** Keep `user_wishlist_events` and `user_like_events` for backward compatibility; add `event_user_actions`. Map: Saved = event_user_actions(action_type='saved'); Like can remain separate or migrate to a “soft like” in event_user_actions later. For Phase 1, we introduce event_user_actions for going/interested/saved/reminder; like stays in user_like_events.

---

#### `user_favorite_events` (new)

| Column     | Type        | Constraints                           | Description        |
|------------|-------------|----------------------------------------|--------------------|
| id         | UUID        | PK, DEFAULT gen_random_uuid()          |                    |
| user_id    | UUID        | NOT NULL, FK auth.users ON DELETE CASCADE |                    |
| event_id   | TEXT        | NOT NULL                              | Past event only    |
| rank       | INT         | NOT NULL, CHECK (rank BETWEEN 1 AND 10) | 1=top, 10=last     |
| created_at | TIMESTAMPTZ | DEFAULT NOW()                          |                    |
| UNIQUE(user_id, rank)                    |             | One rank per user                      |                    |
| UNIQUE(user_id, event_id)                |             | One favorite per event                 |                    |

**Indexes:** `(user_id)`, `(event_id)` for lookups.

---

#### `user_follows` (new — user-to-user, approval-based)

| Column       | Type        | Constraints                           | Description         |
|--------------|-------------|----------------------------------------|---------------------|
| id           | UUID        | PK, DEFAULT gen_random_uuid()          |                     |
| follower_id  | UUID        | NOT NULL, FK auth.users ON DELETE CASCADE | Requester           |
| following_id | UUID        | NOT NULL, FK auth.users ON DELETE CASCADE | Target user         |
| status       | TEXT        | NOT NULL, CHECK IN ('pending','accepted','rejected') |                  |
| created_at   | TIMESTAMPTZ | DEFAULT NOW()                          |                     |
| updated_at   | TIMESTAMPTZ | DEFAULT NOW()                          |                     |
| UNIQUE(follower_id, following_id)        |             | One follow relationship                |                     |

**Indexes:**
- `(following_id, status)` — “pending requests for user X”
- `(follower_id, status)` — “who I follow / requested”

---

#### `subscriptions` (new)

| Column         | Type        | Constraints                           | Description              |
|----------------|-------------|----------------------------------------|--------------------------|
| id             | UUID        | PK, DEFAULT gen_random_uuid()          |                          |
| user_id        | UUID        | NOT NULL, FK auth.users ON DELETE CASCADE |                        |
| entity_type    | TEXT        | NOT NULL, CHECK IN ('venue','promoter','tag') |                   |
| entity_id      | TEXT        | NOT NULL                              | venue_id, promoter_id, tag string |
| notify_new_event | BOOLEAN   | DEFAULT true                          | Opt-in per subscription  |
| notify_digest  | BOOLEAN    | DEFAULT true                          | Include in digest        |
| created_at     | TIMESTAMPTZ | DEFAULT NOW()                         |                          |
| UNIQUE(user_id, entity_type, entity_id) |          | One sub per entity                     |                          |

**Indexes:**
- `(user_id)` — user’s subscriptions
- `(entity_type, entity_id)` — “notify all subs for this venue/promoter/tag”

**Note:** `user_follow_venues` and `user_follow_promoters` already exist. Subscriptions are for *notifications*. We can:
- Option A: Keep follow tables for “follow” UX; add subscriptions as separate “get notified” toggle
- Option B: Merge follow + subscribe into one table with notify flags

**Recommendation:** Option A — follow = “I follow this venue/promoter”; subscribe = “notify me about new events”. User can follow without subscribing.

---

#### `notification_queue` (new — plan only, not fully implemented until approved)

| Column       | Type        | Constraints                    | Description            |
|--------------|-------------|--------------------------------|------------------------|
| id           | UUID        | PK, DEFAULT gen_random_uuid()  |                        |
| user_id      | UUID        | NOT NULL, FK auth.users        |                        |
| type         | TEXT        | NOT NULL                       | reminder, new_event, digest, etc. |
| payload_json | JSONB       |                                | Event ID, entity IDs, etc. |
| channel      | TEXT        | CHECK IN ('push','email')      |                        |
| scheduled_at | TIMESTAMPTZ |                                | When to send           |
| sent_at      | TIMESTAMPTZ | NULL                           | NULL = pending         |
| created_at   | TIMESTAMPTZ | DEFAULT NOW()                  |                        |

**Indexes:** `(user_id, sent_at)`, `(scheduled_at)` for batch processing.

---

### 2.2 Enum / Status Definitions

- **event_user_actions.action_type:** `going` | `interested` | `saved` | `reminder` | `went`
- **user_follows.status:** `pending` | `accepted` | `rejected`
- **subscriptions.entity_type:** `venue` | `promoter` | `tag`

---

## 3. Permission Logic

### 3.1 Visibility Rules

| Data                          | Logged-out | Logged-in (non-follower) | Approved follower | Private mode |
|-------------------------------|------------|---------------------------|-------------------|--------------|
| Event Going count             | ✓          | ✓                         | ✓                 | ✓            |
| Event Interested count        | ✓          | ✓                         | ✓                 | ✓            |
| “X of your followers going”   | ✗          | ✗                         | ✓                 | ✗            |
| User’s Going list             | ✗          | ✗                         | ✓                 | ✗            |
| User’s Interested list        | ✗          | ✗                         | ✓                 | ✗            |
| User’s Saved / Reminder       | ✗          | ✗                         | ✗                 | ✗            |
| User’s Favorite events        | ✗          | ✗                         | ✓                 | ✗            |
| User’s followers/following    | ✗          | ✗                         | ✓*                | ✗            |
| Avatar, display_name, bio     | ✓          | ✓                         | ✓                 | ✓            |

*Follower/following list: only visible to the profile owner and approved followers (optional restriction).

### 3.2 RLS Policies (Summary)

- **event_user_actions:** User can CRUD only their own rows.
- **user_favorite_events:** User can CRUD only their own rows.
- **user_follows:** User can create (request), read own rows; target user can update status.
- **subscriptions:** User can CRUD only their own rows.
- **user_profiles:** User can read/update own; others can read public fields (avatar, display_name, bio, location, social_link) when profile exists.

**Service role / backend** for:
- Event counts (aggregate, no PII)
- “X of your followers going” (requires follower check + count)

---

## 4. Backend Logic

### 4.1 Event Interaction Service

- `setEventAction(userId, eventId, actionType, opts?)` — upsert or delete
- `getEventActions(userId)` — return sets: goingIds, interestedIds, savedIds, reminderIds
- `getEventCounts(eventId)` — return { goingCount, interestedCount }
- `getFollowersGoingCount(viewerId, eventId)` — count of viewer’s accepted followers who are Going

### 4.2 Reminder Logic

- On insert/update of `event_user_actions` with `action_type='reminder'`:
  - Compute `scheduled_at` from `reminder_hours_before` or `reminder_at`
  - Insert into `notification_queue` (when implemented)
- Default: 24 hours before event.

### 4.3 Subscription Logic

- On new event creation (from CSV sync or future source):
  - Resolve event’s venue_id, promoter_id, tags
  - Find subscriptions matching (venue, promoter, or tag)
  - For each, enqueue notification (when queue is implemented)

### 4.4 Follow Logic

- `requestFollow(followerId, followingId)` — insert status=`pending`
- `acceptFollow(id, userId)` — update status=`accepted` (only if userId = following_id)
- `rejectFollow(id, userId)` — update status=`rejected`
- `unfollow(followerId, followingId)` — delete row
- `getFollowers(userId)` — where following_id=userId, status=`accepted`
- `getFollowing(userId)` — where follower_id=userId, status=`accepted`

### 4.5 Favorite Events Logic

- `addFavorite(userId, eventId, rank)` — insert/update; enforce max 10, reorder if needed
- `removeFavorite(userId, eventId)` — delete
- `reorderFavorites(userId, orderedEventIds)` — update ranks 1–10
- Only past events allowed (validation at service layer).

---

## 5. API Endpoints

### 5.1 Event Interactions

| Method | Endpoint                         | Description                          |
|--------|----------------------------------|--------------------------------------|
| GET    | /api/events/[id]/actions         | Get current user’s actions for event |
| POST   | /api/events/[id]/actions         | Set action (going, interested, saved, reminder) |
| DELETE | /api/events/[id]/actions/[type]  | Remove action                        |
| GET    | /api/events/[id]/counts          | goingCount, interestedCount (public) |
| GET    | /api/events/[id]/followers-going | Count of viewer’s followers going (auth required) |

### 5.2 Reminders

| Method | Endpoint                     | Description                    |
|--------|------------------------------|--------------------------------|
| PATCH  | /api/events/[id]/reminder    | Set reminder timing (hours before or at) |

### 5.3 Subscriptions

| Method | Endpoint                | Description              |
|--------|-------------------------|--------------------------|
| GET    | /api/subscriptions      | List user’s subscriptions |
| POST   | /api/subscriptions      | Add subscription         |
| PATCH  | /api/subscriptions/[id] | Update notify flags      |
| DELETE | /api/subscriptions/[id] | Remove subscription      |

### 5.4 User Follows

| Method | Endpoint                        | Description                   |
|--------|---------------------------------|-------------------------------|
| GET    | /api/users/[id]/followers       | List followers (with visibility check) |
| GET    | /api/users/[id]/following       | List following                |
| POST   | /api/users/[id]/follow-request  | Request to follow             |
| POST   | /api/follow-requests/[id]/accept| Accept request                |
| POST   | /api/follow-requests/[id]/reject| Reject request                |
| DELETE | /api/users/[id]/unfollow        | Unfollow                      |
| GET    | /api/follow-requests            | Pending requests for current user |

### 5.5 Profile

| Method | Endpoint              | Description                  |
|--------|------------------------|------------------------------|
| GET    | /api/users/[id]/profile| Public profile (avatar, name, bio, etc.) |
| PATCH  | /api/profile           | Update own profile           |
| POST   | /api/profile/avatar    | Upload avatar (storage)      |

### 5.6 Favorite Events

| Method | Endpoint                    | Description                 |
|--------|-----------------------------|-----------------------------|
| GET    | /api/favorites              | List user’s favorites (1–10)|
| POST   | /api/favorites              | Add favorite with rank      |
| PATCH  | /api/favorites/reorder      | Reorder (ordered event IDs) |
| DELETE | /api/favorites/[eventId]    | Remove favorite             |

---

## 6. UI Structure

### 6.1 Event Page / Modal

- **Action buttons:** Going | Interested | Saved | Reminder
- **Social proof:** “X going · Y interested” + “Z of your followers going” (if logged in + has followers)
- **Reminder modal:** When user selects Reminder — pick timing (1h, 6h, 24h, custom) and channel (push/email when available)

### 6.2 Profile Page

- **Header:** Avatar, display name, bio, location, social link
- **Sections (visibility per permissions):**
  - Favorite events (ranked 1–10) — followers only
  - Upcoming (Going) — followers only
  - Interested — followers only
  - Saved events — private (not shown to followers)
  - Subscriptions — user’s venues, promoters, tags
  - Followers / Following — if we show lists

### 6.3 Settings / Profile Edit

- Upload avatar
- Edit display name, bio (max 160), location, social link
- Private mode toggle
- Notification preferences (digest, instant, reminder channels)

### 6.4 Follow UX

- “Follow” on user profile → creates pending request
- Target user: “Follow requests” section with Accept/Reject
- No public discovery feed — follow via shared profile links only

---

## 7. Edge Cases

| Case                                | Handling                                                                 |
|-------------------------------------|---------------------------------------------------------------------------|
| User deletes account                | CASCADE on FK; cleanup follows, actions, favorites, subscriptions        |
| Event deleted from source           | Keep rows with orphan event_id; filter in UI; optional cleanup job       |
| User removes Going after event      | Allow; no “Went” auto-fill in Phase 1                                    |
| User blocks another (future)        | Add user_blocks table; exclude from followers and visibility             |
| User switches persona               | Personas don’t affect event actions; actions are account-level           |
| Event cancelled                     | Show status in UI; user can remove Going/Interested; no auto-remove      |
| Reminder for past event             | Reject or warn in API                                                    |
| Duplicate follow request            | Upsert; idempotent                                                       |
| Favorite for non-past event         | Reject in API                                                            |
| >10 favorites                       | Reject add; must remove or reorder first                                 |

---

## 8. Implementation Phases

### Phase 1 — Core Tables + Going/Interested/Saved/Reminder

**DB:**
- Create `event_user_actions` table
- Extend `user_profiles` (display_name, avatar_url, bio, location, social_link, private_mode)
- Migration to backfill “saved” from `user_wishlist_events` into `event_user_actions` (optional; can run in parallel initially)

**Backend:**
- Event action service (set, get, delete)
- Event counts API
- Reminder storage (no queue yet)

**UI:**
- Event action buttons: Going, Interested, Saved, Reminder
- Event counts display
- Profile edit form (display name, bio, avatar, etc.)
- Profile “Upcoming (Going)” section

**Deliverable:** Users can mark Going/Interested/Saved/Reminder; see counts; edit profile.

---

### Phase 2 — Subscriptions + Notification Engine

**DB:**
- Create `subscriptions` table
- Create `notification_queue` table

**Backend:**
- Subscription CRUD
- Trigger logic: on new event → find matching subscriptions → enqueue
- Notification worker (cron/edge): process queue, send push/email (implement when approved)

**UI:**
- Subscribe toggle on venue/promoter/tag
- Subscription management in profile/settings

**Deliverable:** Users can subscribe; queue is populated; sending implemented when approved.

---

### Phase 3 — Follow System + Privacy

**DB:**
- Create `user_follows` table

**Backend:**
- Follow request, accept, reject, unfollow
- Visibility helpers: “can viewer see X’s Going/Interested/Favorites?”
- “X of your followers going” for event page

**UI:**
- Follow request button on profile
- Pending requests inbox
- Apply visibility rules to profile sections

**Deliverable:** Approval-based follows; followers see Going/Interested/Favorites; “followers going” on events.

---

### Phase 4 — Favorites + Profile Polish

**DB:**
- Create `user_favorite_events` table

**Backend:**
- Favorite CRUD, reorder
- Validation: past events only, max 10

**UI:**
- Favorite events management (add, remove, reorder)
- “Favorite Events” section on profile (followers only)

**Deliverable:** Ranked favorite past events; visible to followers only.

---

## 9. Constraints (Confirmed)

- No public activity feed
- No ratings, comments, reviews, or messaging
- No story scraping or invasive scraping
- No publishing/deployment until approved

---

## 10. Files to Create / Modify (Outline)

### New files (examples)

- `supabase/migrations/002_event_user_actions.sql`
- `supabase/migrations/003_user_profiles_extend.sql`
- `supabase/migrations/004_user_follows.sql`
- `supabase/migrations/005_subscriptions.sql`
- `supabase/migrations/006_user_favorite_events.sql`
- `supabase/migrations/007_notification_queue.sql`
- `src/lib/eventActions.ts` — event action service
- `src/lib/subscriptions.ts` — subscription service
- `src/lib/userFollows.ts` — follow service
- `src/lib/favorites.ts` — favorites service
- `src/app/api/events/[id]/actions/route.ts`
- `src/app/api/events/[id]/counts/route.ts`
- … (per API list above)
- `src/components/EventActionButtons.tsx` — extend with Going, Interested, Reminder

### Modified files

- `src/contexts/UserActionsContext.tsx` — add going, interested, saved (from event_user_actions), reminder
- `src/components/ProfileSupabaseSections.tsx` — add Going, Favorite Events; apply visibility
- `src/app/profile/page.tsx` — profile edit, avatar upload
- `EventModal` / event detail — new action buttons, counts, “followers going”

---

## 11. Next Steps

1. Review this plan.
2. Approve or request changes.
3. After approval, begin Phase 1 implementation.

---

*Document version: 1.0 — Planning only*
