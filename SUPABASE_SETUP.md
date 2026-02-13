# Supabase Setup & Implementation Summary

## Overview

This document describes the Supabase authentication and user actions implementation for the Lisbon Events Calendar.

## 1. Environment Variables

Add to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

When these are set, the app uses **Supabase Auth** (email/password) and persists follow/wishlist/like actions to Supabase. When not set, the app falls back to NextAuth (existing behavior).

## 2. Database Migration

Run the SQL in `supabase/migrations/001_user_actions.sql` in your Supabase project's SQL Editor. This creates:

- `user_profiles` – optional profile data synced from auth.users
- `user_follow_venues` – followed venues (venue_id TEXT)
- `user_follow_promoters` – followed promoters (promoter_id TEXT)
- `user_wishlist_events` – wishlisted events (event_id TEXT)
- `user_like_events` – liked events (event_id TEXT)

All tables use Row Level Security (RLS) so users can only access their own data.

## 3. Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client |
| `src/lib/auth/supabaseAuth.tsx` | Auth provider (SupabaseAuthProvider) |
| `src/lib/auth/pendingIntents.ts` | Logged-out intent preservation (localStorage) |
| `src/lib/userActions.ts` | Follow, wishlist, like CRUD |
| `src/contexts/UserActionsContext.tsx` | Bulk fetch + state for user actions |
| `src/components/AuthGate.tsx` | Sign-up/login modal for logged-out actions |
| `src/components/FollowVenueButton.tsx` | Follow venue (Supabase) |
| `src/components/FollowPromoterButton.tsx` | Follow promoter (Supabase) |
| `src/components/EventActionButtons.tsx` | Wishlist + like for events |

## 4. Auth Flow

- **Supabase configured**: Login/signup use `supabase.auth.signInWithPassword`, `supabase.auth.signUp`, and `supabase.auth.signInWithOAuth` (Google, Facebook). Session persists in localStorage; `onAuthStateChange` keeps the UI in sync.
- **Supabase not configured**: Login/signup use NextAuth (existing) with credentials, Google, Facebook.

## 4.1 Google & Facebook OAuth (Supabase)

To enable "Continue with Google" and "Continue with Facebook" when using Supabase:

### Step 1: Configure Redirect URLs in Supabase

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. Add your app URLs to **Redirect URLs**:
   - `http://localhost:3000/profile` (local dev)
   - `https://yourdomain.com/profile` (production)
3. Set **Site URL** to your production URL (e.g. `https://yourdomain.com`)

### Step 2: Enable Google Provider

1. Supabase Dashboard → **Authentication** → **Providers** → **Google**
2. Toggle **Enable Sign in with Google** ON
3. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Create **OAuth 2.0 Client ID** (Web application)
   - **Authorized redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Copy **Client ID** and **Client Secret** into Supabase
4. Save in Supabase

### Step 3: Enable Facebook Provider

1. Supabase Dashboard → **Authentication** → **Providers** → **Facebook**
2. Toggle **Enable Sign in with Facebook** ON
3. Create an app in [Facebook Developers](https://developers.facebook.com/apps/):
   - Add **Facebook Login** product
   - **Valid OAuth Redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Copy **App ID** and **App Secret** into Supabase (App ID = Client ID, App Secret = Client Secret)
4. Save in Supabase

Replace `<your-project-ref>` with your Supabase project URL (e.g. `abcdefgh.supabase.co` → ref is `abcdefgh`).

## 5. Logged-Out Actions

If a user is not logged in and clicks follow, wishlist, or like:

1. A modal appears: "Sign up to [action]..."
2. Buttons: Sign up, Log in, Continue browsing
3. The action is stored in `localStorage` as a pending intent
4. After successful login, pending intents are executed automatically and cleared

## 6. Mobile UI Fix

On mobile (< 768px):

- Removed the redundant "List / This week" toggle
- Only the slider (Today, Tomorrow, This week, This month) + Near me controls the list
- Single list view with time range and Near me filters

## 7. Profile Page (Supabase)

When using Supabase auth, the profile page shows:

- Email, name
- Followed venues (links to `/venues/[id]`)
- Followed promoters (links to `/promoters/[id]`)
- Wishlisted events count + link to calendar
- Liked events count + link to calendar

## 8. Technical Notes

- **Venue/Promoter IDs**: Stored as `TEXT` and normalized to lowercase for comparison.
- **Event IDs**: Use the same string IDs as `NormalizedEvent.id`.
- **Bulk fetch**: On login, `UserActionsProvider` loads all followed venues, promoters, wishlisted events, and liked events in one batch to avoid N+1 queries.
- **Optimistic UI**: Toggles update immediately and roll back on API error.

## 9. Remaining Technical Debt

- Venue/promoter profile lists show IDs only; could resolve to display names from CSV/API.
- Saved views and personas still use the file-based DB; not wired to Supabase.
- Password reset is not implemented (Supabase supports it; UI would need a flow).
- No real-time notifications; messaging is informational only.
