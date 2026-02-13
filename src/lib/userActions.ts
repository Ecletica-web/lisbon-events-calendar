/**
 * User actions (follow, wishlist/saved, like, event actions) - uses Supabase client with RLS
 * Call from client only when user is logged in via Supabase
 */

import { supabase } from './supabase/client'
import { fetchEventActionsBulk, setEventAction, removeEventAction } from './eventActions'

export async function followVenue(userId: string, venueId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('user_follow_venues')
    .upsert({ user_id: userId, venue_id: venueId }, { onConflict: 'user_id,venue_id' })
  return { error: error?.message }
}

export async function unfollowVenue(userId: string, venueId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('user_follow_venues')
    .delete()
    .eq('user_id', userId)
    .eq('venue_id', venueId)
  return { error: error?.message }
}

export async function followPromoter(userId: string, promoterId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('user_follow_promoters')
    .upsert({ user_id: userId, promoter_id: promoterId }, { onConflict: 'user_id,promoter_id' })
  return { error: error?.message }
}

export async function unfollowPromoter(userId: string, promoterId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('user_follow_promoters')
    .delete()
    .eq('user_id', userId)
    .eq('promoter_id', promoterId)
  return { error: error?.message }
}

export async function addToWishlist(userId: string, eventId: string): Promise<{ error?: string }> {
  return setEventAction(userId, eventId, 'saved')
}

export async function removeFromWishlist(userId: string, eventId: string): Promise<{ error?: string }> {
  return removeEventAction(userId, eventId, 'saved')
}

export async function likeEvent(userId: string, eventId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('user_like_events')
    .upsert({ user_id: userId, event_id: eventId }, { onConflict: 'user_id,event_id' })
  return { error: error?.message }
}

export async function unlikeEvent(userId: string, eventId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('user_like_events')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId)
  return { error: error?.message }
}

export interface UserActionsBulk {
  followedVenueIds: Set<string>
  followedPromoterIds: Set<string>
  wishlistedEventIds: Set<string>
  likedEventIds: Set<string>
  goingIds: Set<string>
  interestedIds: Set<string>
  reminderIds: Set<string>
}

export async function fetchUserActionsBulk(userId: string): Promise<UserActionsBulk> {
  const result: UserActionsBulk = {
    followedVenueIds: new Set(),
    followedPromoterIds: new Set(),
    wishlistedEventIds: new Set(),
    likedEventIds: new Set(),
    goingIds: new Set(),
    interestedIds: new Set(),
    reminderIds: new Set(),
  }
  if (!supabase) return result

  const [venues, promoters, likes, eventActions] = await Promise.all([
    supabase.from('user_follow_venues').select('venue_id').eq('user_id', userId),
    supabase.from('user_follow_promoters').select('promoter_id').eq('user_id', userId),
    supabase.from('user_like_events').select('event_id').eq('user_id', userId),
    fetchEventActionsBulk(userId),
  ])

  venues.data?.forEach((r) => result.followedVenueIds.add(r.venue_id))
  promoters.data?.forEach((r) => result.followedPromoterIds.add(r.promoter_id))
  likes.data?.forEach((r) => result.likedEventIds.add(r.event_id))
  result.wishlistedEventIds = eventActions.savedIds
  result.goingIds = eventActions.goingIds
  result.interestedIds = eventActions.interestedIds
  result.reminderIds = eventActions.reminderIds

  return result
}
