# Lisbon Events Calendar

A read-only, Google Calendar-like event calendar for Lisbon cultural events.

## Features

- 📅 Multiple views: Month, Week, Day, and List
- 🏷️ Tag filtering with AND logic
- 🔍 Text search across titles, venues, and tags
- 🌍 Fixed timezone: Europe/Lisbon
- 📊 Loads events from Google Sheets CSV
- 📱 Responsive design
- 🎨 Minimal, clean UI

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` from the example and add at least the events CSV URL:
   ```bash
   cp .env.example .env.local
   ```
   Set `NEXT_PUBLIC_EVENTS_CSV_URL` (required). For the full list of optional variables (venues, tags, Supabase, NextAuth), see [docs/SETUP.md](docs/SETUP.md).

3. Add your Google Sheets CSV URL to `.env.local`:
   ```
   NEXT_PUBLIC_EVENTS_CSV_URL=your_google_sheets_csv_url_here
   ```

   To get the CSV URL from Google Sheets:
   - Open your Google Sheet
   - File > Share > Publish to web
   - Select the sheet (e.g., "events_clean")
   - Choose "CSV" format
   - Copy the URL

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000/calendar](http://localhost:3000/calendar)

**Further setup:** Auth and user actions (Supabase), OAuth, and database migrations are documented in [docs/SETUP.md](docs/SETUP.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md), and [OAUTH_SETUP.md](OAUTH_SETUP.md).

## CSV Format

Minimum for events: `id` (or `event_id`), `title`, `start_datetime`. Optional: `end_datetime`, `venue_name`, `tags`, `source_url`, and many more. Full column reference: [docs/SCHEMA.md](docs/SCHEMA.md). Rows missing required fields are ignored.

## Tech Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- FullCalendar, PapaParse (CSV parsing)
- Supabase (auth, profiles, follows, likes, saved views), NextAuth (fallback)
