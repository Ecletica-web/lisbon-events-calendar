# Setup checklist

Single reference for environment variables and database migrations. Use this when setting up a new environment or rebuilding.

## 1. Environment variables

Copy `.env.example` to `.env.local` and fill in values. Full list:

### Required for calendar + events

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_EVENTS_CSV_URL` | **Published** CSV URL for events. In Google Sheets: **File → Share → Publish to web** → pick the sheet → **Comma-separated values (.csv)** → copy the link. Do **not** use the normal sheet URL (the one with `/edit?gid=...`) — that returns HTML and events will not load. Required for the calendar to load. |

### Optional CSV URLs (enrich data)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_VENUES_CSV_URL` | CSV for venues (slug, name, instagram, etc.). |
| `NEXT_PUBLIC_EVENT_TAGS_CSV_URL` | One column `tag` per row; only these tags are kept for events. |
| `NEXT_PUBLIC_VENUE_TAGS_CSV_URL` | One column `tag` per row; only these tags are kept for venues. |
| `NEXT_PUBLIC_PROMOTERS_CSV_URL` | CSV for promoters. |

### Feature flags (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_ENABLE_PROFILE` | `true` | Enable profile page and auth-gated features. |
| `NEXT_PUBLIC_ENABLE_PERSONAS` | `true` | Enable personas. |
| `NEXT_PUBLIC_ENABLE_SHARED_VIEWS` | `true` | Enable shared saved views. |

### Supabase (optional but recommended for auth + social)

When set, signup/login and user actions (follow, like, going, saved) use Supabase.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g. `https://xxx.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key; required for profile edits, friend requests, and other server-side ops that bypass RLS. Do not expose to the client. |

OAuth (Google/Facebook) when using Supabase is configured in **Supabase Dashboard → Authentication → Providers**, not via env.

### NextAuth (fallback when Supabase is not set)

If Supabase env vars are missing, the app can use NextAuth. Then these are needed:

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`). |
| `NEXTAUTH_SECRET` | Secret for signing (e.g. `openssl rand -base64 32`). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console. |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | From Facebook Developers. |

See [OAUTH_SETUP.md](../OAUTH_SETUP.md) for OAuth provider setup.

---

## 2. Database migrations (Supabase)

If you use Supabase, run **all** migrations in `supabase/migrations/` **in numeric order** (001 → 013) in the Supabase SQL Editor.

| Migration | Purpose |
|-----------|---------|
| 001_user_actions | user_profiles, user_follow_venues, user_follow_promoters, user_wishlist_events, user_like_events |
| 002_event_user_actions | going, interested, saved, reminder (event_user_actions) |
| 003_user_profiles_extend | display_name, avatar_url, bio, location, social_link, private_mode |
| 004_wishlist_to_event_actions | Backfill wishlist into event_user_actions(saved) |
| 005_follows | User-to-user follows (asymmetric) |
| 006_profile_cover_username | cover_url, username (unique) on user_profiles |
| 007_profile_storage_bucket | Storage bucket for profile assets |
| 008_user_profile_notifications | Notification settings for user_profiles |
| 009_notify_venues_personas_promoters | Notifications for venues/personas/promoters |
| 010_onboarding | Onboarding fields on user_profiles |
| 011_friend_requests_event_visibility | Friend requests and event visibility |
| 012_user_interactions_activity | User interactions / activity |
| 013_friend_requests_delete_policy | RLS policy for friend request delete |
| 014_drop_user_follows | Drops user-to-user follows table (friends only; see docs/FRIENDS_VS_FOLLOWS.md) |

Details: [SUPABASE_SETUP.md](../SUPABASE_SETUP.md). See [docs/FRIENDS_VS_FOLLOWS.md](FRIENDS_VS_FOLLOWS.md) for friends vs follow distinction.

---

## 3. Auth: Supabase vs NextAuth

- **When Supabase is configured** (URL + anon key in env), the app uses **Supabase only** for login, signup, and session. NextAuth is not loaded.
- **When Supabase is not set** (e.g. local dev without Supabase), the app falls back to **NextAuth** (credentials + OAuth). Set `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and OAuth client IDs as in the table above.

For production on Vercel, set Supabase env vars so the app runs with a single auth system.

---

## 4. Deploying to Vercel

1. **Environment variables (B3)**  
   In Vercel: Project → Settings → Environment Variables, add the same vars as in section 1 (at least `NEXT_PUBLIC_EVENTS_CSV_URL`; for auth add Supabase URL, anon key, and service role key for Production).

2. **Supabase production (B4)**  
   - Use the same Supabase project or a separate one for production. Run the same migrations (section 2) on that project’s SQL Editor.  
   - In **Supabase Dashboard → Authentication → URL configuration**, add your **production site URL** (e.g. `https://your-app.vercel.app`) to **Redirect URLs**. Otherwise Google/Facebook sign-in will fail after deploy.

---

## 5. PWA (installable web app)

The app includes a web app manifest so users can “Add to Home Screen” on mobile. Icons live in `public/`; replace `icon-192.png` and `icon-512.png` with your own for a custom install icon.

## 6. Other docs

- **CSV column contract:** [docs/SCHEMA.md](SCHEMA.md)
- **Supabase auth and OAuth:** [SUPABASE_SETUP.md](../SUPABASE_SETUP.md), [OAUTH_SETUP.md](../OAUTH_SETUP.md)
- **Features and roadmap:** [docs/MASTER_TASK_LIST_ARCHITECTURE.md](MASTER_TASK_LIST_ARCHITECTURE.md)
- **Friends vs follow distinction:** [docs/FRIENDS_VS_FOLLOWS.md](FRIENDS_VS_FOLLOWS.md)
