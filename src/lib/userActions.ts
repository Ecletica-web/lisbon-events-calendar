/**
 * User actions — unified interaction layer. All writes/reads go through user_interactions.
 */

import {
  recordInteraction,
  removeInteraction,
  fetchUserInteractionsBulk,
  type UserInteractionsBulk,
} from './interactions'

export async function followVenue(userId: string, venueId: string): Promise<{ error?: string }> {
  return recordInteraction(userId, 'venue', venueId, 'follow_venue')
}

export async function unfollowVenue(userId: string, venueId: string): Promise<{ error?: string }> {
  return removeInteraction(userId, 'venue', venueId, 'follow_venue')
}

export async function followPromoter(userId: string, promoterId: string): Promise<{ error?: string }> {
  return recordInteraction(userId, 'promoter', promoterId, 'follow_promoter')
}

export async function unfollowPromoter(userId: string, promoterId: string): Promise<{ error?: string }> {
  return removeInteraction(userId, 'promoter', promoterId, 'follow_promoter')
}

export async function addToWishlist(userId: string, eventId: string): Promise<{ error?: string }> {
  return recordInteraction(userId, 'event', eventId, 'save')
}

export async function removeFromWishlist(userId: string, eventId: string): Promise<{ error?: string }> {
  return removeInteraction(userId, 'event', eventId, 'save')
}

export async function likeEvent(userId: string, eventId: string): Promise<{ error?: string }> {
  return recordInteraction(userId, 'event', eventId, 'like')
}

export async function unlikeEvent(userId: string, eventId: string): Promise<{ error?: string }> {
  return removeInteraction(userId, 'event', eventId, 'like')
}

export type UserActionsBulk = UserInteractionsBulk

export async function fetchUserActionsBulk(userId: string): Promise<UserActionsBulk> {
  return fetchUserInteractionsBulk(userId)
}
