# Venue Alias Strategy

Venues are resolved by identity, not fuzzy strings. The **VenueIndex** enables deterministic matching.

---

## Venue resolution priority

When normalizing an event, `venue_id` is resolved in this order:

1. **Event has `venue_id`** and it exists in VenueIndex → use it
2. **Match by `instagram_handle`** (event `source_name` or raw venue field)
3. **Match by exact normalized venue name** (lowercase, trimmed)
4. **Match by alias** (pipe-separated in Venue CSV)
5. **No match** → `venue_id = "unknown"`, keep `venue_name_raw` for manual review

---

## VenueIndex structure

- `byId: Map<venue_id, Venue>`
- `byName: Map<normalized_name, venue_id>`
- `byAlias: Map<normalized_alias, venue_id>`
- `byInstagramHandle: Map<normalized_handle, venue_id>`

---

## Fallback

If `NEXT_PUBLIC_VENUES_CSV_URL` is not set, the app falls back to `canonicalVenues.ts`, which maps `key` → `venue_id`, `handle` → instagram, `name` → name.
