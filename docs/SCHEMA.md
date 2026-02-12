# Lisbon Events Calendar — Ingestion Contract

This document describes the **Event CSV** and **Venue CSV** schemas. Treat these as a public contract. If columns are renamed, update `src/data/schema/eventColumns.ts` and `venueColumns.ts` only.

---

## Event CSV Columns

| Column | Type | Required | Meaning | Example |
|--------|------|----------|---------|---------|
| `event_id` | string | Yes* | Stable unique identifier. *Legacy: `id` maps here.* | `evt_123` |
| `title` | string | Yes | Event title | `Jazz Night` |
| `start_datetime` | ISO string | Yes | Start date/time (ISO 8601) | `2025-02-15T20:00:00` |
| `end_datetime` | ISO string | No | End date/time | `2025-02-16T02:00:00` |
| `timezone` | string | No | IANA timezone. Default: `Europe/Lisbon` | `Europe/Lisbon` |
| `is_all_day` | bool/string | No | `true`/`false` or `"true"`/`"1"` | `false` |
| `status` | string | No | `scheduled`, `cancelled`, `postponed`, `sold_out`, `draft`, `archived`. Legacy: `active`, `needs_review` → scheduled | `scheduled` |
| `venue_id` | string | No | Stable venue ID (matches Venue CSV) | `lux-fragil` |
| `venue_name` | string | No | Display name (fallback if venue_id missing) | `Lux Frágil` |
| `venue_address` | string | No | Full address | `Av. Infante D. Henrique` |
| `neighborhood` | string | No | Area/neighborhood | `Santa Apolónia` |
| `city` | string | No | City | `Lisboa` |
| `region` | string | No | Region | `Lisboa` |
| `country` | string | No | Country | `Portugal` |
| `postal_code` | string | No | Postal code | `1100-405` |
| `latitude` | number | No | Latitude | `38.7223` |
| `longitude` | number | No | Longitude | `-9.1393` |
| `description_short` | string | No | Short description | `Live jazz night` |
| `description_long` | string | No | Full description | `...` |
| `category` | string | No | Category (lowercase) | `music` |
| `tags` | string | No | Pipe-separated. Max 5. If Event Tags CSV set, only valid tags kept | `jazz|live|techno` |
| `promoter_id` | string | No | Promoter ID (matches Promoters CSV) | `brunch-electronik` |
| `promoter_name` | string | No | Promoter display name (fallback) | `Brunch Electronik` |
| `price_min` | number | No | Min price | `10` |
| `price_max` | number | No | Max price | `25` |
| `currency` | string | No | Currency code | `EUR` |
| `is_free` | bool/string | No | Free event | `false` |
| `age_restriction` | string | No | Age limit | `18+` |
| `language` | string | No | Event language | `pt` |
| `ticket_url` | URL | No | Ticket link | `https://...` |
| `primary_image_url` | URL | No | Main image. *Legacy: `image_url`* | `https://...` |
| `primary_image_id` | string | No | Image ID | - |
| `image_credit` | string | No | Credit for image | - |
| `source_name` | string | No | Source identifier (e.g. Instagram handle) | `luxfragil` |
| `source_url` | URL | No | Source page | `https://...` |
| `source_event_id` | string | No | ID from source system | - |
| `dedupe_key` | string | No | Manual dedupe key | - |
| `confidence_score` | number | No | 0–1 confidence | `0.95` |
| `last_seen_at` | ISO | No | Last seen in feed | - |
| `created_at` | ISO | No | Created timestamp | - |
| `updated_at` | ISO | No | Updated timestamp | - |
| `opens_at` | string | No | Opening time for all-day (HH:MM) | `14:00` |
| `recurrence_rule` | string | No | Recurrence (iCal) | - |

**Legacy column mapping:** `id` → `event_id`, `image_url` → `primary_image_url`

---

## Venue CSV Columns

| Column | Type | Required | Meaning | Example |
|--------|------|----------|---------|---------|
| `venue_id` | string | Yes | Stable unique ID (slug-friendly) | `lux-fragil` |
| `name` | string | Yes | Display name | `Lux Frágil` |
| `slug` | string | No | URL slug (default: slugify name) | `lux-fragil` |
| `aliases` | string | No | Pipe-separated aliases | `Musicbox|Music Box Lisboa` |
| `instagram_handle` | string | No | Instagram handle (no @) | `luxfragil` |
| `primary_image_url` | URL | No | Venue image | - |
| `description_short` | string | No | Short description (~160 chars) | - |
| `website_url` | URL | No | Venue website | - |
| `venue_tags` | string | No | Pipe-separated tags. If Venue Tags CSV set, only valid tags kept | `club|rooftop` |
| `address` | string | No | Full address | - |
| `city` | string | No | City | `Lisboa` |
| `neighborhood` | string | No | Neighborhood | - |
| `lat` / `latitude` | number | No | Latitude | - |
| `lng` / `longitude` | number | No | Longitude | - |
| `venue_url` | URL | No | Venue website (legacy) | - |
| `instagram_url` | URL | No | Instagram URL | - |

---

## Promoters CSV Columns

| Column | Type | Required | Meaning | Example |
|--------|------|----------|---------|---------|
| `promoter_id` | string | Yes | Stable unique ID | `brunch-electronik` |
| `name` | string | Yes | Display name | `Brunch Electronik` |
| `slug` | string | No | URL slug | `brunch-electronik` |
| `instagram_handle` | string | No | Instagram handle | `brunchelectronik_lisboa` |
| `website_url` | URL | No | Website | - |
| `description_short` | string | No | Short description | - |
| `primary_image_url` | URL | No | Promoter image | - |
| `is_active` | bool/string | No | Default true. Inactive promoters excluded | `true` |

---

## Event Tags CSV / Venue Tags CSV

Single column: `tag`. One tag per row. Lowercase recommended. If set, only tags in this list are kept for events/venues respectively.
