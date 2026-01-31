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

2. Create `.env.local` file:
   ```bash
   cp .env.local.example .env.local
   ```

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

## CSV Format

Expected columns in your Google Sheet:

- `id` (string, required) - Stable unique identifier
- `title` (string, required) - Event title
- `start_datetime` (ISO string, required) - Start date/time in Lisbon timezone
- `end_datetime` (ISO string, optional) - End date/time
- `venue_name` (string, optional) - Venue name
- `tags` (comma-separated string, optional) - Event tags
- `source_url` (URL string, optional) - Source link

Rows missing `id`, `title`, or `start_datetime` will be ignored.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- FullCalendar
- PapaParse (CSV parsing)
