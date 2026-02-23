# Event images from Instagram (static URLs)

Instagram image URLs are temporary and break. To use scraped images on event cards you need to **store them yourself** and put the **permanent URL** in your event data (e.g. `primary_image_url` in the CSV/sheet).

## Setup

1. **Run the migration** so the `event-images` bucket exists:
   - `supabase/migrations/017_event_images_bucket.sql`

2. **Set an API key** for your scraper (server-only, not public):
   - In Vercel / env: `EVENT_IMPORT_API_KEY=<a-long-random-secret>`
   - The scraper will send this on each request so only it can call the API.

## Flow

1. **Scraper** gets an event from Instagram and the **temporary** image URL (or the image bytes).
2. **Persist the image** by calling the app:
   - **Option A – upload file (recommended for Instagram)**  
     Scraper downloads the image (with its own session/cookies), then POSTs it:
     - `POST /api/admin/events/persist-image`
     - `Content-Type: multipart/form-data`
     - Fields: `file` (image file), `eventId` (your stable event id, e.g. from sheet or `event_id`)
     - Header: `x-api-key: <EVENT_IMPORT_API_KEY>` or `Authorization: Bearer <EVENT_IMPORT_API_KEY>`
   - **Option B – pass URL (for non-Instagram URLs)**  
     App fetches the image and stores it:
     - `POST /api/admin/events/persist-image`
     - `Content-Type: application/json`
     - Body: `{ "eventId": "<event_id>", "imageUrl": "https://..." }`
     - Same auth header.  
     (Instagram often blocks server-side fetches; prefer Option A for Instagram.)
3. **Response:** `{ "url": "https://<project>.supabase.co/storage/v1/object/public/event-images/<eventId>.jpg" }`
4. **Scraper** writes this `url` into your event record as `primary_image_url` (e.g. in the Google Sheet column `primary_image_url`). The app already reads that column and shows it on event cards.

## Paths in storage

- Files are stored as: `event-images/<eventId>.<ext>` (e.g. `event-images/evt_abc123.jpg`).
- `eventId` is sanitized (only letters, numbers, `_`, `-`; max 128 chars).
- Same `eventId` overwrites the previous file (`upsert: true`).

## Limits

- Max file size: 5MB.
- Allowed types: jpg, png, gif, webp.

## Example (Node.js scraper, file upload)

```js
const form = new FormData()
form.append('eventId', event.event_id)   // e.g. from your sheet
form.append('file', imageBuffer, { filename: 'poster.jpg' })

const res = await fetch('https://your-app.vercel.app/api/admin/events/persist-image', {
  method: 'POST',
  headers: { 'x-api-key': process.env.EVENT_IMPORT_API_KEY },
  body: form,
})
const { url } = await res.json()
// Write `url` to primary_image_url for this event in your sheet
```

## Example (JSON, server-side fetch)

```js
const res = await fetch('https://your-app.vercel.app/api/admin/events/persist-image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.EVENT_IMPORT_API_KEY,
  },
  body: JSON.stringify({ eventId: event.event_id, imageUrl: temporaryInstagramUrl }),
})
const { url } = await res.json()
// Use `url` as primary_image_url (note: Instagram may block this fetch)
```
