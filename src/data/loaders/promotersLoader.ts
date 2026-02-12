/**
 * Promoters loader — fetches from CSV if URL set
 */

import Papa from 'papaparse'
import type { Promoter } from '@/models/Promoter'

export interface RawPromoterRow {
  [key: string]: string | number | boolean | undefined
}

function getStr(row: RawPromoterRow, col: string): string | undefined {
  const val = row[col]
  return val?.toString().trim() || undefined
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizePromoter(raw: RawPromoterRow): Promoter | null {
  const id = getStr(raw, 'promoter_id')
  const name = getStr(raw, 'name')
  if (!id && !name) return null

  const promoter_id = id || toSlug(name || 'unknown')
  const displayName = name || promoter_id
  const slug = getStr(raw, 'slug') || toSlug(displayName)
  const isActiveRaw = getStr(raw, 'is_active')
  const is_active = isActiveRaw === undefined || isActiveRaw === ''
    ? true
    : isActiveRaw.toLowerCase() === 'true' || isActiveRaw === '1' || isActiveRaw.toLowerCase() === 'yes'

  return {
    promoter_id,
    name: displayName,
    slug,
    instagram_handle: getStr(raw, 'instagram_handle') ?? undefined,
    website_url: getStr(raw, 'website_url') ?? undefined,
    description_short: getStr(raw, 'description_short') ?? undefined,
    primary_image_url: getStr(raw, 'primary_image_url') ?? undefined,
    is_active,
  }
}

export async function loadPromoters(csvUrl?: string | null): Promise<Promoter[]> {
  if (!csvUrl) return []

  try {
    const response = await fetch(csvUrl, { cache: 'no-store' })
    if (!response.ok) return []
    const csvText = await response.text()
    return new Promise((resolve) => {
      Papa.parse<RawPromoterRow>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const promoters: Promoter[] = []
          for (const row of results.data) {
            const p = normalizePromoter(row)
            if (p && p.is_active) promoters.push(p)
          }
          resolve(promoters)
        },
        error: () => resolve([]),
      })
    })
  } catch {
    return []
  }
}
