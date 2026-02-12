/**
 * Optional collections loader — loads if URLs are set
 * Event can belong to 0..n collections; Venue can belong to 0..n venue collections.
 * Site works fully without collections.
 */

import Papa from 'papaparse'
import type { Collection, CollectionItem } from '@/models/Collection'
import { normalizeBoolean } from './utils'

export interface RawCollectionRow {
  collection_id?: string
  collection_type?: string
  name?: string
  slug?: string
  description?: string
  city?: string
  priority?: string | number
  is_active?: string | boolean
}

export interface RawCollectionItemRow {
  collection_id?: string
  item_type?: string
  item_id?: string
  sort_order?: string | number
}

export interface LoadCollectionsResult {
  collections: Collection[]
  collectionItems: CollectionItem[]
  quarantined: { row: RawCollectionRow | RawCollectionItemRow; error: string }[]
}

export function normalizeCollection(raw: RawCollectionRow): Collection | null {
  const id = raw.collection_id?.toString().trim()
  const name = raw.name?.toString().trim()
  const slug = raw.slug?.toString().trim() || (name ? name.toLowerCase().replace(/\s+/g, '-') : '')
  if (!id || !name) return null

  const priority = raw.priority != null ? Number(raw.priority) : undefined
  const isActive = normalizeBoolean(raw.is_active, true)

  return {
    collection_id: id,
    collection_type: (raw.collection_type?.toString().trim() || 'event') as 'event' | 'venue',
    name,
    slug,
    description: raw.description?.toString().trim() || undefined,
    city: raw.city?.toString().trim() || undefined,
    priority: isNaN(priority!) ? undefined : priority,
    is_active: isActive,
  }
}

export function normalizeCollectionItem(raw: RawCollectionItemRow): CollectionItem | null {
  const collectionId = raw.collection_id?.toString().trim()
  const itemType = raw.item_type?.toString().trim() as 'event' | 'venue' | undefined
  const itemId = raw.item_id?.toString().trim()
  if (!collectionId || !itemId) return null
  const type = itemType === 'venue' ? 'venue' : 'event'
  const sortOrder = raw.sort_order != null ? Number(raw.sort_order) : undefined
  return {
    collection_id: collectionId,
    item_type: type,
    item_id: itemId,
    sort_order: isNaN(sortOrder!) ? undefined : sortOrder,
  }
}

export async function loadCollections(
  collectionsUrl?: string | null,
  itemsUrl?: string | null
): Promise<LoadCollectionsResult> {
  const collections: Collection[] = []
  const collectionItems: CollectionItem[] = []
  const quarantined: { row: RawCollectionRow | RawCollectionItemRow; error: string }[] = []

  if (collectionsUrl) {
    try {
      const res = await fetch(collectionsUrl, { cache: 'no-store' })
      if (res.ok) {
        const text = await res.text()
        Papa.parse<RawCollectionRow>(text, {
          header: true,
          skipEmptyLines: true,
          complete: (r) => {
            for (const row of r.data) {
              const c = normalizeCollection(row)
              if (c) collections.push(c)
              else quarantined.push({ row, error: 'Invalid collection row' })
            }
          },
        })
      }
    } catch (e) {
      console.warn('[collectionsLoader] collections fetch failed:', e)
    }
  }

  if (itemsUrl) {
    try {
      const res = await fetch(itemsUrl, { cache: 'no-store' })
      if (res.ok) {
        const text = await res.text()
        Papa.parse<RawCollectionItemRow>(text, {
          header: true,
          skipEmptyLines: true,
          complete: (r) => {
            for (const row of r.data) {
              const i = normalizeCollectionItem(row)
              if (i) collectionItems.push(i)
              else quarantined.push({ row, error: 'Invalid collection item row' })
            }
          },
        })
      }
    } catch (e) {
      console.warn('[collectionsLoader] collection items fetch failed:', e)
    }
  }

  return { collections, collectionItems, quarantined }
}

/**
 * Get event IDs that belong to a collection by slug.
 * Returns empty Set if collection not found or no items.
 */
export function getEventIdsByCollectionSlug(
  collections: Collection[],
  collectionItems: CollectionItem[],
  slug: string
): Set<string> {
  const col = collections.find((c) => c.slug === slug && c.is_active)
  if (!col) return new Set()
  return new Set(
    collectionItems
      .filter((i) => i.collection_id === col.collection_id && i.item_type === 'event')
      .map((i) => i.item_id)
  )
}
