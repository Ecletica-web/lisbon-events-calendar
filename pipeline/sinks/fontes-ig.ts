/**
 * Watchlist mapping for the pipeline package.
 * Mirrors src/lib/fontesIgWatchlist.ts (kept local so pipeline stays standalone).
 *
 * Primary SoT: Venues + Promoters catalog tabs (instagram_handle + is_active).
 * Legacy fallback: Fontes IG - Venues / Fontes IG - Promoters / combined Fontes IG.
 */

export type NormalizedWatchlistEntry = {
  handle: string
  type: 'venue' | 'promoter'
  active: boolean
  /** Display name */
  name?: string
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

/** 0-based column index (A=0, B=1, C=2, …). */
function col(row: Record<string, string>, index: number): string {
  const keys = Object.keys(row)
  if (index < 0 || index >= keys.length) return ''
  return String(row[keys[index]] ?? '').trim()
}

export function normalizeIgHandle(raw: string): string {
  let h = raw.trim()
  if (!h) return ''
  if (/^https?:\/\//i.test(h) && !/instagram\.com/i.test(h)) return ''
  const igMatch = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (igMatch) h = igMatch[1]
  h = h.replace(/^@/, '').toLowerCase().split(/[/?#]/)[0]
  if (!h || /\s/.test(h) || /^https?:/i.test(h)) return ''
  return h
}

/** Empty / missing → active. Falsey strings → inactive. */
export function parseIsActive(raw: string): boolean {
  if (!raw || !String(raw).trim()) return true
  return !['false', '0', 'no', 'n', 'inactive', 'off'].includes(String(raw).trim().toLowerCase())
}

function inferType(venueTypeRaw: string, typeRaw: string): 'venue' | 'promoter' {
  const blob = `${typeRaw} ${venueTypeRaw}`.toLowerCase()
  if (/\bpromoter\b|\blabel\b|\bfestival\b/.test(blob)) return 'promoter'
  if (typeRaw.trim().toLowerCase() === 'promoter') return 'promoter'
  return 'venue'
}

/**
 * Map a Venues or Promoters catalog row → watchlist entry.
 * Requires non-empty instagram_handle; active from is_active (default true).
 */
export function rowToCatalogWatchlistEntry(
  row: Record<string, string>,
  forceType: 'venue' | 'promoter'
): NormalizedWatchlistEntry | null {
  const handle = normalizeIgHandle(
    pick(row, 'instagram_handle', 'Handle / Website', 'handle', 'Handle', 'instagram')
  )
  if (!handle) return null

  const name = pick(row, 'name', 'Name') || handle
  const active = parseIsActive(pick(row, 'is_active', 'Active', 'active', 'enabled'))

  return {
    handle,
    type: forceType,
    active,
    name,
    notes: name,
  }
}

/** Legacy Fontes IG row → watchlist entry. */
export function rowToWatchlistEntry(
  row: Record<string, string>,
  forceType?: 'venue' | 'promoter'
): NormalizedWatchlistEntry | null {
  const handle = normalizeIgHandle(
    col(row, 2) ||
      pick(row, 'Handle / Website', 'handle', 'Handle', 'instagram', 'instagram_handle')
  )
  if (!handle) return null

  const name = pick(row, 'Name', 'name') || col(row, 1)
  const venueType = pick(row, 'Venue Type', 'venue_type', 'type') || col(row, 3)
  const eventTypes = pick(row, 'Event Types', 'event_types', 'notes') || col(row, 4)
  const type = forceType ?? inferType(venueType, pick(row, 'type'))
  const active = parseIsActive(
    pick(row, 'is_active', 'Active', 'active', 'enabled') || col(row, 5)
  )

  return {
    handle,
    type,
    active,
    name: name || undefined,
    notes: [name, eventTypes].filter(Boolean).join(' · ') || undefined,
  }
}

export function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
