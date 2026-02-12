/**
 * Event tags loader — fetches allowed tags from CSV (single column: tag)
 */

import Papa from 'papaparse'

export async function loadEventTags(csvUrl?: string | null): Promise<string[]> {
  if (!csvUrl) return []

  try {
    const response = await fetch(csvUrl, { cache: 'no-store' })
    if (!response.ok) return []
    const csvText = await response.text()
    return new Promise((resolve) => {
      Papa.parse<{ tag?: string }>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const tags = new Set<string>()
          for (const row of results.data) {
            const t = row.tag?.toString().trim().toLowerCase()
            if (t) tags.add(t)
          }
          resolve(Array.from(tags))
        },
        error: () => resolve([]),
      })
    })
  } catch {
    return []
  }
}
