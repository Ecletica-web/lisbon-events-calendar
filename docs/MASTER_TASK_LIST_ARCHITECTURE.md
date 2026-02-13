# Lisbon Events Calendar — Master Task List & Architecture Plan

> **Status:** PLANNING — Do NOT deploy until approved  
> **Vision:** Spotify for events + light social signals + identity-driven discovery

---

## Current State (Already Implemented)

| Feature | Status | Notes |
|--------|--------|------|
| Going | ✅ Done | `event_user_actions` (action_type='going') |
| Like | ✅ Done | `user_like_events` |
| Save | ✅ Done | `event_user_actions` (action_type='saved') |
| Interested | ✅ Done | `event_user_actions` |
| Reminder | ✅ Done | `event_user_actions` |
| Like count on events | ✅ Done | `/api/events/[id]/likes`, `EventLikeCount` |
| Going/Interested counts | ✅ Done | `/api/events/[id]/counts`, `EventCounts` |
| Profile: avatar, display_name, bio | ✅ Done | `user_profiles` extended |
| Add to Google Calendar | ✅ Done | `getGoogleCalendarUrl`, button in EventModal |
| PersonaManager (NextAuth) | ✅ Done | Create/edit personas with filter picker |
| Follow venues/promoters | ✅ Done | Supabase |
| Event cards in sliders | ✅ Done | `EventCardsSlider`, `EventCard` |

---

## Phase 1 — Core Social Foundation

### 1️⃣ Going State

**Status:** ✅ Implemented

- `event_user_actions` stores Going (no separate `event_attendance` needed)
- Going is visible to friends once follow system exists
- Stored separately from likes/saves

**No schema change.** Align naming in UI/docs if desired.

---

### 2️⃣ Upgrade Event Flashcards

#### A) Like Count — ✅ Done

Display `❤️ N` on cards. `EventLikeCount` exists; ensure it renders on **EventCard** (slider cards), not only in EventModal.

**Action:** Add `EventLikeCount` to `EventCard` in EventCardsSlider.

#### B) Friend Avatars (Going)

**Requires:** User follow system (Phase 1.4) first.

**Logic:**
- Fetch users who are Going and are followers of current user (or following)
- Resolve avatar URLs from `user_profiles.avatar_url`
- Display up to 3 stacked avatars; if more → "+N"
- Click opens modal with full list; each profile clickable
- API: `GET /api/events/[id]/going-friends` — returns `{ users: [{ id, avatar_url, display_name }] }`

**DB:** Use `event_user_actions` (going) + `follows` (friends). "Friends" = users you follow who also follow you (mutual), OR asymmetric "people you follow" depending on product choice.

#### C) Typography Hierarchy

**EventCard updates:**
- Event title: `text-base` → `text-lg font-bold`
- Venue: `text-sm` → `text-base font-medium`
- Date/time: clearer, slightly larger
- Price: more prominent (e.g. `text-sm font-semibold`)

#### D) Venue & Promoter Social Links

**Data:** Venues/promoters have `instagram_handle`, `website_url`. Events have `venueId`, `venueKey`, `promoterId`, `promoterName`.

**Options:**
1. Enrich events at fetch: merge venue/promoter social links into `extendedProps` (e.g. `venueInstagram`, `venueWebsite`, `promoterInstagram`, `promoterWebsite`)
2. Resolve at render: EventCard receives `venues`/`promoters` and looks up by `venueId`/`promoterId`

**Recommendation:** Add enrichment in `fetchEvents` or a dedicated `enrichEventsWithVenuePromoterLinks()` when building listing. Or add `/api/events?include=venue_promoter_links` that returns enriched events.

**UI:** Small icon row at bottom of card: Venue Instagram, Venue Website, Promoter Instagram, Promoter Website (only when present).

---

### 3️⃣ Profile Upgrade

| Field | Current | Target |
|-------|---------|--------|
| Profile image | avatar_url | ✅ |
| Cover image | — | Add `cover_url` |
| Username | — | Add `username` (unique, slug for URLs) |
| Bio | bio (160) | 160–200 chars |
| Friends see | — | Going, Saved (if public), public personas |
| Followers/Following | — | Add counts |

**Schema:**
```sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD CONSTRAINT user_profiles_username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30);
CREATE UNIQUE INDEX idx_user_profiles_username_lower ON user_profiles (LOWER(username));
```

**Visibility:** Add `saved_events_visibility` ENUM ('public'|'friends'|'private'), `going_visibility`, etc. Or single `profile_visibility` for simplicity.

---

### 4️⃣ Friends System (Asymmetric Follow)

**Model:** Instagram-style — follow/unfollow, no approval.

**Schema:**
```sql
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (follower_id, following_id)
);
CREATE INDEX idx_follows_following ON follows (following_id);
CREATE INDEX idx_follows_follower ON follows (follower_id);
```

**RLS:** Users can CRUD own follow rows (insert/delete); read: own rows + public profiles of followed/followers.

**APIs:**
- `POST /api/users/[id]/follow` — follow
- `DELETE /api/users/[id]/follow` — unfollow
- `GET /api/users/[id]/followers` — list followers (with visibility)
- `GET /api/users/[id]/following` — list following
- `GET /api/users/[id]/profile` — public profile (avatar, username, bio, counts)

**Profile:** Add "Friends" / "Following" / "Followers" tab or section.

---

### 5️⃣ Persona System (Supabase)

**Current:** Personas live in file-based DB (NextAuth). Need Supabase-backed personas for unified auth.

**Schema:**
```sql
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  filters JSONB NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'friends' CHECK (visibility IN ('public','friends','private')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**filters JSON:** `{ includeTags?, includeCategories?, includeVenues?, excludeTags?, freeOnly? }`

**Migration:** When Supabase is primary, migrate file-based personas to Supabase. NextAuth users without Supabase keep file-based until migration.

---

## Phase 2 — Intelligence & Identity

### 6️⃣ Auto-Generated Taste Profile

**Inputs:** Likes, Saves, Going (from `event_user_actions`, `user_like_events`).

**Compute (batch or on-demand):**
- Top genres → aggregate `extendedProps.tags` from attended/saved/liked events
- Top areas → aggregate `venueName` / neighborhood
- Most active day → day-of-week from event start dates
- Average price range → from `priceMin`/`priceMax`
- Most attended category → `extendedProps.category`

**Storage:** `user_taste_summary` table or derived at read time.

**UI:** "Taste Summary" section on profile.

---

### 7️⃣ Activity Feed (Minimal)

**Scope:** Profile only, not global feed.

**Schema:**
```sql
CREATE TABLE user_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'going', 'liked', 'saved', 'persona_created'
  event_id TEXT,
  persona_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Options:**
1. Dedicated table (above)
2. Derive from `event_user_actions` + `personas` with joins (no new table)

**Recommendation:** Derive from existing tables. Query `event_user_actions` + `user_like_events` + `personas` ordered by `created_at` for the profile user.

---

### 8️⃣ Mutual Event Indicator

**Logic:** When viewing friend's profile, compute:
- Events both saved
- Events both going to

**API:** `GET /api/users/[id]/mutual-events` returns `{ saved: [...], going: [...] }`.

---

### 9️⃣ Smart Notifications

**Schema:**
```sql
CREATE TABLE notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_going BOOLEAN DEFAULT true,
  friend_saved BOOLEAN DEFAULT true,
  followed_venue_new_event BOOLEAN DEFAULT true,
  followed_promoter_new_event BOOLEAN DEFAULT true,
  weekly_digest BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Implementation:** Settings UI in profile. Actual delivery (email/push) depends on notification infra (Phase 2 of original plan).

---

## Connected Accounts

### 🔵 Google Integration

**Status:** ✅ Add to Google Calendar via URL (no OAuth). Already implemented.

**Optional upgrade:** OAuth + Google Calendar API for one-click add without leaving app. Requires:
- Google OAuth
- `calendar.events.insert` scope
- Backend or client flow to create event via API

**Recommendation:** Keep URL-based flow for now; OAuth is a later enhancement.

### 🟢 Spotify Integration (Future)

- OAuth connect
- Store connection for taste signals
- No streaming; used for future AI recommendations

---

## UI & Design Fixes

### 10️⃣ Login & Signup Styling

**Current:** White background.

**Target:** Dark gradient matching app theme. Update `login/page.tsx` and `signup/page.tsx`:
- Wrap in `bg-slate-900` or gradient
- Ensure card styling matches `EventModal` / profile cards
- Use same border, backdrop-blur, etc.

---

### 11️⃣ Navbar Bug Fix

**Problem:** Navbar buttons sometimes don’t work on profile page.

**Investigation:**
- Check `Navigation.tsx` for `<a href>` vs `<Link href>`
- Ensure client-side routing; avoid full page reload
- Check for hydration mismatch (client vs server markup)
- Verify no `preventDefault` or `stopPropagation` blocking navigation

**Fix:** Replace `<a>` with `<Link>` where internal; ensure no conflicting handlers.

---

## Optional (Later Phase)

### 12️⃣ Light Badge System

**Examples:** "Night Owl", "Culture Lover", "Early Explorer"

**Logic:** Auto-assign from behavior (e.g. events after 22:00 → Night Owl).

**Schema:** `user_badges` or `user_profiles.badges` JSON array.

---

### 13️⃣ Trending Indicator

**Examples:** "Trending this week", "12 people saved this", "3 friends going"

**Data:** Aggregate saves/goings over time window. Cache or compute on read.

---

## Implementation Order

### Phase 1 (Must Build First)

1. **Friends system** — `follows` table, APIs, profile counts
2. **Profile upgrade** — cover, username, visibility
3. **Event card upgrades** — Like count on card, typography, venue/promoter social links
4. **Friend avatars on cards** — "X friends going" with avatars (depends on #1)
5. **Persona migration** — Supabase personas for Supabase users
6. **Login/Signup styling** — Dark theme
7. **Navbar bug fix**

### Phase 2

8. Taste profile
9. Activity feed (minimal)
10. Mutual event indicator
11. Notification settings UI

### Later

12. Badges
13. Trending
14. Spotify OAuth
15. Google Calendar OAuth (optional)

---

## Database Migration Summary

| Migration | Tables / Changes |
|-----------|------------------|
| 005_profile_cover_username | user_profiles: cover_url, username (unique) |
| 006_follows | follows (follower_id, following_id) |
| 007_personas_supabase | personas (user_id, name, emoji, filters, visibility) |
| 008_notification_settings | notification_settings |
| 009_user_activities | Optional, or derive from existing |

---

## API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/[id]/profile | Public profile |
| PATCH | /api/profile | Update own profile |
| POST | /api/users/[id]/follow | Follow user |
| DELETE | /api/users/[id]/follow | Unfollow |
| GET | /api/users/[id]/followers | List followers |
| GET | /api/users/[id]/following | List following |
| GET | /api/events/[id]/going-friends | Users (friends) going |
| GET | /api/users/[id]/mutual-events | Events both saved/going |
| GET/PATCH | /api/notification-settings | Get/update notification prefs |

---

## File Impact (Estimated)

- `EventCardsSlider.tsx` / `EventCard` — Like count, typography, social links, friend avatars
- `EventModal.tsx` — Already has actions, Google Calendar
- `ProfileSupabaseSections.tsx` — Friends tab, activity, taste summary
- `login/page.tsx`, `signup/page.tsx` — Dark styling
- `Navigation.tsx` — Navbar fix
- `user_profiles` — Cover, username, visibility
- New: `FollowButton` (user), `FriendAvatars`, `MutualEvents`, `TasteSummary`

---

*Document version: 1.0 — Awaiting approval before implementation*
