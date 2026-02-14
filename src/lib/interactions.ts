/**
 * Unified interaction layer — single source of truth for all user signals.
 * Recommendation engine fuel. One row per user + entity + interaction type.
 */

import { supabase } from './supabase/client'

export type InteractionType =
  | 'like'
  | 'save'
  | 'going'
  | 'interested'
  | 'follow_venue'
  | 'follow_promoter'
  | 'reminder'

export type EntityType = 'event' | 'venue' | 'promoter'

export interface RecordInteractionOptions {
  reminder_hours_before?: number
}

export async function recordInteraction(
  userId: string,
  entityType: EntityType,
  entityId: string,
  interactionType: InteractionType,
  opts?: RecordInteractionOptions
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const metadata_json =
    interactionType === 'reminder' && opts?.reminder_hours_before != null
      ? { reminder_hours_before: opts.reminder_hours_before }
      : {}
  const { error } = await supabase.from('user_interactions').upsert(
    {
      user_id: userId,
      entity_type: entityType,
      entity_id: (entityId || '').trim().toLowerCase(),
      interaction_type: interactionType,
      metadata_json,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,entity_type,entity_id,interaction_type' }
  )
  return { error: error?.message }
}

export async function removeInteraction(
  userId: string,
  entityType: EntityType,
  entityId: string,
  interactionType: InteractionType
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const eid = (entityId || '').trim().toLowerCase()
  const { error } = await supabase
    .from('user_interactions')
    .delete()
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', eid)
    .eq('interaction_type', interactionType)
  return { error: error?.message }
}

export interface UserInteractionsBulk {
  followedVenueIds: Set<string>
  followedPromoterIds: Set<string>
  wishlistedEventIds: Set<string>
  likedEventIds: Set<string>
  goingIds: Set<string>
  interestedIds: Set<string>
  reminderIds: Set<string>
}

const norm = (id: string) => (id || '').toLowerCase().trim()

export async function fetchUserInteractionsBulk(userId: string): Promise<UserInteractionsBulk> {
  const result: UserInteractionsBulk = {
    followedVenueIds: new Set(),
    followedPromoterIds: new Set(),
    wishlistedEventIds: new Set(),
    likedEventIds: new Set(),
    goingIds: new Set(),
    interestedIds: new Set(),
    reminderIds: new Set(),
  }
  if (!supabase) return result

  const { data, error } = await supabase
    .from('user_interactions')
    .select('entity_type, entity_id, interaction_type')
    .eq('user_id', userId)

  if (error) return result

  data?.forEach((r) => {
    const id = norm(r.entity_id)
    if (!id) return
    if (r.entity_type === 'venue' && r.interaction_type === 'follow_venue') result.followedVenueIds.add(id)
    else if (r.entity_type === 'promoter' && r.interaction_type === 'follow_promoter') result.followedPromoterIds.add(id)
    else if (r.entity_type === 'event') {
      if (r.interaction_type === 'like') result.likedEventIds.add(id)
      else if (r.interaction_type === 'save') result.wishlistedEventIds.add(id)
      else if (r.interaction_type === 'going') result.goingIds.add(id)
      else if (r.interaction_type === 'interested') result.interestedIds.add(id)
      else if (r.interaction_type === 'reminder') result.reminderIds.add(id)
    }
  })
  return result
}
