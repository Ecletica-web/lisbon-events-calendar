/**
 * Data loaders — exports for events, venues, collections
 */

export { loadEvents, normalizeEvent, filterEventsForListing, deduplicateEvents } from './eventsLoader'
export type { RawEventRow, LoadEventsResult } from './eventsLoader'

export { loadVenues, normalizeVenue } from './venuesLoader'
export type { RawVenueRow, LoadVenuesResult } from './venuesLoader'

export { loadCollections, normalizeCollection, normalizeCollectionItem, getEventIdsByCollectionSlug } from './collectionsLoader'
export type { LoadCollectionsResult } from './collectionsLoader'
