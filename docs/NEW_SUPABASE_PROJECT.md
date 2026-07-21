# New Supabase project setup — `fytnwjhlinmusfrxtxaz`

Project URL: `https://fytnwjhlinmusfrxtxaz.supabase.co`

## You do this in the Supabase dashboard (required)

### 1. Run the schema
1. Open **SQL Editor** → New query  
2. Paste the entire file [`supabase/SETUP_NEW_PROJECT.sql`](supabase/SETUP_NEW_PROJECT.sql)  
3. **Run** (may take ~30s)

### 2. Auth URL config
**Authentication → URL Configuration**
- **Site URL:** `https://lisbon-events-calendar.vercel.app`
- **Redirect URLs:**
  - `https://lisbon-events-calendar.vercel.app/**`
  - `https://lisbon-events-calendar.vercel.app/auth/callback`
  - `https://lisbon-events-calendar.vercel.app/update-password`
  - `http://localhost:3000/**`
  - `http://localhost:3000/auth/callback`

### 3. Create admin user
**Authentication → Users → Add user**
- Email: `ecleticaweblda@gmail.com`
- Password: (choose one and save it)
- Auto-confirm: ON

### 4. Copy API keys
**Project Settings → API**
- Project URL (already known)
- `anon` `public` key
- `service_role` `secret` key

## Vercel env (Production) — replace old project

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fytnwjhlinmusfrxtxaz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(new anon key)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(new service_role key)* |
| `ADMIN_EMAILS` | `ecleticaweblda@gmail.com` |

Then **Redeploy**.

## Local `.env.local`
URL is already updated to the new project. Replace:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...` (if present)

## Pipeline `.env` (when scraping)
```
SUPABASE_URL=https://fytnwjhlinmusfrxtxaz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

## Optional: Google login
**Authentication → Providers → Google** — enable and paste Google OAuth client ID/secret.  
Authorized redirect URI in Google Cloud:  
`https://fytnwjhlinmusfrxtxaz.supabase.co/auth/v1/callback`
