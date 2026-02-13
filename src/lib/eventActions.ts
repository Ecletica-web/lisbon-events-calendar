/**
 * Event user actions (going, interested, saved, reminder) - uses Supabase client with RLS
 */

import { supabase } from './supabase/client'

export type EventActionType = 'going' | 'interested' | 'saved' | 'reminder' | 'went'

export interface SetReminderOptions {
  reminder_hours_before?: number
  reminder_at?: string // ISO timestamp
}

export async function setEventAction(
  userId: string,
  eventId: string,
  actionType: EventActionType,
  opts?: SetReminderOptions
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const row: Record<string, unknown> = {
    user_id: userId,
    event_id: eventId,
    action_type: actionType,
    updated_at: new Date().toISOString(),
  }
  if (actionType === 'reminder') {
    row.reminder_hours_before = opts?.reminder_hours_before ?? 24
    row.reminder_at = opts?.reminder_at ?? null
  }
  const { error } = await supabase
    .from('event_user_actions')
    .upsert(row, { onConflict: 'user_id,event_id,action_type' })
  return { error: error?.message }
}

export async function removeEventAction(
  userId: string,
  eventId: string,
  actionType: EventActionType
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('event_user_actions')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('action_type', actionType)
  return { error: error?.message }
}

export interface EventActionsBulk {
  goingIds: Set<string>
  interestedIds: Set<string>
  savedIds: Set<string>
  reminderIds: Set<string>
}

export async function fetchEventActionsBulk(userId: string): Promise<EventActionsBulk> {
  const result: EventActionsBulk = {
    goingIds: new Set(),
    interestedIds: new Set(),
    savedIds: new Set(),
    reminderIds: new Set(),
  }
  if (!supabase) return result

  const { data, error } = await supabase
    .from('event_user_actions')
    .select('event_id, action_type')
    .eq('user_id', userId)
    .in('action_type', ['going', 'interested', 'saved', 'reminder'])

  if (error) return result
  const norm = (id: string) => (id || '').toLowerCase().trim()
  data?.forEach((r) => {
    const eid = norm(r.event_id)
    if (!eid) return
    if (r.action_type === 'going') result.goingIds.add(eid)
    else if (r.action_type === 'interested') result.interestedIds.add(eid)
    else if (r.action_type === 'saved') result.savedIds.add(eid)
    else if (r.action_type === 'reminder') result.reminderIds.add(eid)
  })
  return result
}
