/**
 * Shared Fontes IG ↔ watchlist mapping for the pipeline package.
 * Mirrors src/lib/fontesIgWatchlist.ts (kept local so pipeline stays standalone).
 */

export type NormalizedWatchlistEntry = {
  handle: string
  type: 'venue' | 'promoter'
  active: boolean
  notes?: string
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim()
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase())
    if (found && String(row[found] ?? '').trim()) return String(row[found]).trim()
  }
  return ''
}

function normalizeHandle(raw: string): string {
  let h = raw.trim()
  if (!h) return ''
  if (/^https?:\/\//i.test(h) && !/instagram\.com/i.test(h)) return ''
  const igMatch = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (igMatch) h = igMatch[1]
  h = h.replace(/^@/, '').toLowerCase().split(/[/?#]/)[0]
  if (!h || /\s/.test(h) || /^https?:/i.test(h)) return ''
  return h
}

function inferType(venueTypeRaw: string, typeRaw: string): 'venue' | 'promoter' {
  const blob = `${typeRaw} ${venueTypeRaw}`.toLowerCase()
  if (/\bpromoter\b|\blabel\b|\bfestival\b/.test(blob)) return 'promoter'
  if (typeRaw.trim().toLowerCase() === 'promoter') return 'promoter'
  return 'venue'
}

export function rowToWatchlistEntry(row: Record<string, string>): NormalizedWatchlistEntry | null {
  const handle = normalizeHandle(
    pick(row, 'Handle / Website', 'handle', 'Handle', 'instagram', 'instagram_handle')
  )
  if (!handle) return null

  const name = pick(row, 'Name', 'name')
  const venueType = pick(row, 'Venue Type', 'venue_type', 'type')
  const eventTypes = pick(row, 'Event Types', 'event_types', 'notes')
  const type = inferType(venueType, pick(row, 'type'))
  const activeRaw = pick(row, 'Active', 'active', 'enabled')
  const active =
    activeRaw === ''
      ? true
      : !['false', '0', 'no', 'n', 'inactive', 'off'].includes(activeRaw.toLowerCase())

  return {
    handle,
    type,
    active,
    notes: [name, eventTypes].filter(Boolean).join(' · ') || undefined,
  }
}
