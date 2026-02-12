/**
 * Optional collections model — for future use
 * Event can belong to 0..n collections; Venue can belong to 0..n venue collections.
 */

export type CollectionType = 'event' | 'venue'

export interface Collection {
  collection_id: string
  collection_type: CollectionType
  name: string
  slug: string
  description?: string
  city?: string
  priority?: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface CollectionItem {
  collection_id: string
  item_type: 'event' | 'venue'
  item_id: string
  sort_order?: number
  created_at?: string
}
