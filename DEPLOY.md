# Deploy to Vercel (recommended for Next.js)

## 1. Push your code to GitHub
```bash
git push origin main
```

## 2. Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in (use GitHub)
2. Click **Add New** → **Project**
3. Import `Ecletica-web/lisbon-events-calendar`
4. Leave framework preset as **Next.js** (auto-detected)

## 3. Add Environment Variables
In **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_EVENTS_CSV_URL` | `https://docs.google.com/spreadsheets/d/1kXx0Nw_iJNX73gCnK_byG7o5r5LJVy2SVhpLc8wmUk0/export?format=csv&gid=977896462` |
| `NEXT_PUBLIC_VENUES_CSV_URL` | `https://docs.google.com/spreadsheets/d/1kXx0Nw_iJNX73gCnK_byG7o5r5LJVy2SVhpLc8wmUk0/export?format=csv&gid=1135937280` |
| `NEXT_PUBLIC_EVENT_TAGS_CSV_URL` | `https://docs.google.com/spreadsheets/d/1kXx0Nw_iJNX73gCnK_byG7o5r5LJVy2SVhpLc8wmUk0/export?format=csv&gid=26543790` |
| `NEXT_PUBLIC_VENUE_TAGS_CSV_URL` | `https://docs.google.com/spreadsheets/d/1kXx0Nw_iJNX73gCnK_byG7o5r5LJVy2SVhpLc8wmUk0/export?format=csv&gid=1823379312` |

## 4. Deploy
Click **Deploy**. Vercel will build and give you a live URL (e.g. `lisbon-events-calendar.vercel.app`).

---

**Note:** If you enable auth (`NEXT_PUBLIC_ENABLE_PROFILE=true`), add `NEXTAUTH_URL` (your production URL) and `NEXTAUTH_SECRET` in Vercel env vars.
