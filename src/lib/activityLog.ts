/**
 * Activity signals — data moat for future recommendation/ML.
 */

import { supabase } from './supabase/client'

export type ActionType =
  | 'view_event_modal'
  | 'scroll_feed'
  | 'switch_persona'
  | 'click_venue'
  | 'click_promoter'
  | 'like_event'
  | 'going'
  | 'save_event'

export function logActivity(
  actionType: ActionType,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return
  supabase?.auth.getSession().then(({ data: { session } }) => {
    if (!session?.user?.id) return
    supabase
      ?.from('user_activity_logs')
      .insert({
        user_id: session.user.id,
        action_type: actionType,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        metadata_json: metadata ?? {},
      })
      .then(({ error }) => {
        if (error) console.warn('Activity log error:', error)
      })
  })
}
