# Profiles + Personas + Saved Views — Architecture

## Current Product Features (As-Is)

### Calendar Page
- Filters: search, tags, venues, categories, free-only, exclude exhibitions, exclude continuous
- URL state: view state serialized to query params (v, d, q, cat, tag, venue, t)
- Event modal on click
- Mobile: day sliders, list view
- Desktop: FullCalendar (month/week/day), list view with date nav
- Saved views sidebar: save/load/rename/delete/set-default (localStorage when logged out, DB when logged in)

### Venues Page
- List: grid of venue cards, search, tag filters
- Detail: `/venues/[slug]` — venue info + upcoming events

### Promoters Page
- List + detail pages

### Saved Views
- **localStorage** (`savedViews.ts`): id, name, state (ViewState), isDefault, createdAt, updatedAt
- **DB** (`db/schema.ts`): SavedViewRow — id, user_id, name, state_json, is_default, created_at, updated_at
- **Sync** (`savedViewsSync.ts`): loadSavedViewsFromDB, saveViewToDB, importLocalViewsToDB
- Calendar uses DB when logged in, localStorage when not

### Auth
- NextAuth: Google, Facebook, Credentials
- Session includes user.id (from DB)
- Profile page: name/email, follows, notification settings, import local views
- Login/Signup/Profile routes exist
- **Feature flag**: `NEXT_PUBLIC_ENABLE_PROFILE` — ProfileMenu gated (ProfileMenu uses legacy auth.ts); Navigation shows Profile when session exists (no flag check)

### DB (File-Based JSON)
- `data/users.json`, `saved_views.json`, `follows.json`, `notification_settings.json`
- No personas table yet
- No is_public / share_slug on saved_views

---

## What Needs to Be Added (This Task)

### A) User Accounts + Profiles
- Profile page: My saved views, My personas, My follows (stub), Notification settings (stub)
- Server-side persistence — extend existing DB
- Gate behind `NEXT_PUBLIC_ENABLE_PROFILE`

### B) Saved Views (Core)
- Add to DB schema: `is_public`, `share_slug`
- Save/Load/Update/Duplicate/Delete (already partially done)
- Shareable URL: `/v/[shareSlug]` — apply view state, show "View by @user", "Save a copy" (if logged in)

### C) Personas
- New table: personas (persona_id, owner_user_id, title, slug, description_short, rules_json, is_public, share_slug, created_at, updated_at)
- Rules: include/exclude tags, categories, venues, free_only, language (optional), time window (stub)
- Create from current filters / create manually
- Calendar: Persona dropdown applies rules to filters
- Share URL: `/p/[shareSlug]`

### D) Public Pages
- `/v/[slug]` — public saved view
- `/p/[slug]` — public persona
- `/u/[usernameOrId]` — optional public profile (MVP: list public views/personas)

### E) Feature Flags
- `NEXT_PUBLIC_ENABLE_PROFILE` (existing)
- `NEXT_PUBLIC_ENABLE_PERSONAS`
- `NEXT_PUBLIC_ENABLE_SHARED_VIEWS`
- All default OFF

---

## Database Schema Extensions

### saved_views (extend SavedViewRow)
```ts
// Add to SavedViewRow:
is_public: boolean       // default false
share_slug: string       // stable slug for /v/[slug], unique, e.g. nanoid
```

### personas (new)
```ts
interface PersonaRow {
  id: string
  owner_user_id: string
  title: string
  slug: string           // unique per owner, used in /p/[slug] when public
  description_short?: string
  rules_json: string     // PersonaRules
  is_public: boolean
  share_slug: string     // stable, unique globally for /p/[shareSlug]
  created_at: string
  updated_at: string
}
```

### PersonaRules (JSON)
```ts
interface PersonaRules {
  includeTags?: string[]
  excludeTags?: string[]
  includeCategories?: string[]
  excludeCategories?: string[]
  includeVenues?: string[]
  freeOnly?: boolean
  language?: string
  timeWindow?: { start?: string; end?: string }  // stub
}
```

---

## API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/saved-views` | GET, POST, PATCH, DELETE | (existing) extend with is_public, share_slug |
| `/api/saved-views/public/[shareSlug]` | GET | Fetch public view by share_slug (no auth) |
| `/api/personas` | GET, POST | List/create personas |
| `/api/personas/[id]` | PATCH, DELETE | Update/delete persona |
| `/api/personas/public/[shareSlug]` | GET | Fetch public persona by share_slug |

---

## Public Routes (Pages)

| Route | Description |
|-------|-------------|
| `/v/[slug]` | Public saved view — apply state to calendar, "View by @user", "Save a copy" |
| `/p/[slug]` | Public persona — apply rules to calendar, "Save persona" (if logged in) |
| `/u/[id]` | Public profile — list user's public views & personas (MVP) |

---

## Feature Flag Behavior

| Flag | Default | When ON | When OFF |
|------|---------|---------|----------|
| PROFILE_AUTH | false | Show Profile/Login/SignUp in nav; Profile page accessible | Hide auth UI; redirect /profile → /calendar |
| PERSONAS | false | Show Personas in profile; Persona dropdown on calendar | Hide personas |
| SHARED_VIEWS | false | Allow is_public on views; /v/[slug], /p/[slug] routes | Views always private; public routes 404 |

---

## Migration: localStorage → DB

- On first login with PROFILE_AUTH: prompt "Import views from this device?"
- `importLocalViewsToDB()` already exists
- No schema migration needed for file-based DB — add new fields, new files

---

## Implementation Order

1. Feature flags — add PERSONAS, SHARED_VIEWS
2. DB schema — extend SavedViewRow, add PersonaRow, personas.json
3. DB layer — CRUD for personas, update saved views
4. API routes — personas, public saved view, public persona
5. Profile page — My saved views, My personas (behind flags)
6. Calendar — Persona dropdown (behind flag)
7. Public pages — /v/[slug], /p/[slug], /u/[id]
8. Navigation — gate Profile/Login/SignUp behind PROFILE_AUTH
