/**
 * Normalize a Sheets row into pipeline watchlist fields.
 * Supports:
 *   - legacy "Watchlist" tab: handle, type, active, notes
 *   - LEC "Fontes IG" tab: Name, Handle / Website, Venue Type, Event Types [, Active]
 */

export type NormalizedWatchlistEntry = {
  handle: string
  type: 'venue' | 'promoter'
  active: boolean
  notes: string
  name: string
  venueType: string
  eventTypes: string
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim()
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase())
    if (found && String(row[found] ?? '').trim()) return String(row[found]).trim()
  }
  return ''
}

/** 0-based column index (A=0, B=1, C=2, …) — relies on insertion order from sheet header. */
function col(row: Record<string, string>, index: number): string {
  const keys = Object.keys(row)
  if (index < 0 || index >= keys.length) return ''
  return String(row[keys[index]] ?? '').trim()
}

function normalizeHandle(raw: string): string {
  let h = raw.trim()
  if (!h) return ''
  // Ignore plain websites (no IG handle)
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
  // Fontes IG: column C = Handle / Website (prefer positional, then named headers)
  const handle = normalizeHandle(
    col(row, 2) ||
      pick(row, 'Handle / Website', 'handle', 'Handle', 'instagram', 'instagram_handle')
  )
  if (!handle) return null

  const name = pick(row, 'Name', 'name') || col(row, 1)
  const venueType = pick(row, 'Venue Type', 'venue_type', 'type') || col(row, 3)
  const eventTypes = pick(row, 'Event Types', 'event_types', 'notes') || col(row, 4)
  const type = inferType(venueType, pick(row, 'type'))
  const activeRaw = pick(row, 'Active', 'active', 'enabled') || col(row, 5)
  const active =
    activeRaw === ''
      ? true
      : !['false', '0', 'no', 'n', 'inactive', 'off'].includes(activeRaw.toLowerCase())

  return {
    handle,
    type,
    active,
    notes: [name, eventTypes].filter(Boolean).join(' · ') || pick(row, 'notes'),
    name: name || handle,
    venueType: venueType || (type === 'promoter' ? 'Promoter' : 'Venue'),
    eventTypes,
  }
}

/** Canonical Fontes IG header used when rewriting the tab from admin. */
export const FONTES_IG_HEADER = ['#', 'Name', 'Handle / Website', 'Venue Type', 'Event Types', 'Active']

export function watchlistEntriesToFontesRows(
  entries: Array<{
    handle: string
    type: string
    active: boolean
    notes?: string
    name?: string
    venueType?: string
    eventTypes?: string
  }>
): string[][] {
  return entries
    .map((e, i) => {
      const handle = normalizeHandle(e.handle)
      if (!handle) return null
      const name = (e.name || e.notes?.split(' · ')[0] || handle).trim()
      const venueType =
        e.venueType ||
        (e.type === 'promoter' ? 'Promoter' : 'Venue')
      const eventTypes = e.eventTypes || (e.notes?.includes(' · ') ? e.notes.split(' · ').slice(1).join(' · ') : '')
      return [
        String(i + 1),
        name,
        `@${handle}`,
        venueType,
        eventTypes,
        e.active ? 'true' : 'false',
      ]
    })
    .filter((r): r is string[] => r != null)
}
