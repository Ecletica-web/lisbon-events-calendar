/**
 * Shared utilities for data loaders
 */

export function normalizeTags(tags?: string | string[] | number | boolean | undefined): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  }
  return String(tags)
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
}

export function normalizeBoolean(value?: string | number | boolean | string[] | undefined, defaultValue = false): boolean {
  if (value === undefined || value === null) return defaultValue
  if (typeof value === 'boolean') return value
  const str = String(value).trim().toLowerCase()
  return str === 'true' || str === '1' || str === 'yes'
}

export function normalizeNumber(value?: string | number | boolean | string[] | undefined): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    return isNaN(value) ? null : value
  }
  const parsed = parseFloat(String(value).trim())
  return isNaN(parsed) ? null : parsed
}

/** Event tags: split by |, trim, lowercase, dedupe, max 5, filter by allowed list if present */
export function normalizeEventTags(
  raw: string | string[] | number | boolean | undefined,
  allowedTags?: string[] | null,
  maxTags = 5
): string[] {
  if (!raw) return []
  const parts = Array.isArray(raw)
    ? raw.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : String(raw)
        .split('|')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of parts) {
    if (seen.has(t)) continue
    if (allowedTags && allowedTags.length > 0 && !allowedTags.includes(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= maxTags) break
  }
  return out
}

/** Venue tags: split by |, trim, lowercase, dedupe, filter by allowed list if present */
export function normalizeVenueTags(
  raw: string | string[] | number | boolean | undefined,
  allowedTags?: string[] | null
): string[] {
  if (!raw) return []
  const parts = Array.isArray(raw)
    ? raw.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : String(raw)
        .split('|')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of parts) {
    if (seen.has(t)) continue
    if (allowedTags && allowedTags.length > 0 && !allowedTags.includes(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Simple non-crypto hash for fingerprint (djb2) */
export function simpleHash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(16)
}
