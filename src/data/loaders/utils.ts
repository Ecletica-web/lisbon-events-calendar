/**
 * Shared utilities for data loaders
 */

export function normalizeTags(tags?: string | string[]): string[] {
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

export function normalizeBoolean(value?: string | boolean, defaultValue = false): boolean {
  if (value === undefined || value === null) return defaultValue
  if (typeof value === 'boolean') return value
  const str = String(value).trim().toLowerCase()
  return str === 'true' || str === '1' || str === 'yes'
}

export function normalizeNumber(value?: string | number): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    return isNaN(value) ? null : value
  }
  const parsed = parseFloat(String(value).trim())
  return isNaN(parsed) ? null : parsed
}
