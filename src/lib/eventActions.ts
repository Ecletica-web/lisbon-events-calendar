/**
 * Event user actions — unified interaction layer (user_interactions).
 */

import { recordInteraction, removeInteraction, fetchUserInteractionsBulk } from './interactions'

export type EventActionType = 'going' | 'interested' | 'saved' | 'reminder' | 'went'

export interface SetReminderOptions {
  reminder_hours_before?: number
  reminder_at?: string
}

export async function setEventAction(
  userId: string,
  eventId: string,
  actionType: EventActionType,
  opts?: SetReminderOptions
): Promise<{ error?: string }> {
  const map: Record<string, 'going' | 'interested' | 'save' | 'reminder'> = {
    going: 'going',
    interested: 'interested',
    saved: 'save',
    reminder: 'reminder',
  }
  const type = map[actionType]
  if (!type) return { error: 'Invalid action type' }
  return recordInteraction(userId, 'event', eventId, type, {
    reminder_hours_before: opts?.reminder_hours_before ?? 24,
  })
}

export async function removeEventAction(
  userId: string,
  eventId: string,
  actionType: EventActionType
): Promise<{ error?: string }> {
  const map: Record<string, 'going' | 'interested' | 'save' | 'reminder'> = {
    going: 'going',
    interested: 'interested',
    saved: 'save',
    reminder: 'reminder',
  }
  const type = map[actionType]
  if (!type) return { error: 'Invalid action type' }
  return removeInteraction(userId, 'event', eventId, type)
}

export interface EventActionsBulk {
  goingIds: Set<string>
  interestedIds: Set<string>
  savedIds: Set<string>
  reminderIds: Set<string>
}

export async function fetchEventActionsBulk(userId: string): Promise<EventActionsBulk> {
  const bulk = await fetchUserInteractionsBulk(userId)
  return {
    goingIds: bulk.goingIds,
    interestedIds: bulk.interestedIds,
    savedIds: bulk.wishlistedEventIds,
    reminderIds: bulk.reminderIds,
  }
}
