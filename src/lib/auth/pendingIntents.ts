const PENDING_INTENTS_KEY = 'lisbon-events-pending-intents'

export type IntentType =
  | 'followVenue'
  | 'followPromoter'
  | 'wishlistEvent'
  | 'likeEvent'
  | 'goingEvent'
  | 'interestedEvent'
  | 'reminderEvent'

export interface PendingIntent {
  type: IntentType
  id: string
  displayName?: string
  createdAt: number
}

export function savePendingIntent(intent: Omit<PendingIntent, 'createdAt'>): void {
  if (typeof window === 'undefined') return
  try {
    const stored = localStorage.getItem(PENDING_INTENTS_KEY)
    const intents: PendingIntent[] = stored ? JSON.parse(stored) : []
    intents.push({ ...intent, createdAt: Date.now() })
    localStorage.setItem(PENDING_INTENTS_KEY, JSON.stringify(intents))
  } catch (e) {
    console.error('Failed to save pending intent', e)
  }
}

export function getPendingIntents(): PendingIntent[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(PENDING_INTENTS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function clearPendingIntents(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PENDING_INTENTS_KEY)
}

export async function executePendingIntents(): Promise<void> {
  const intents = getPendingIntents()
  if (intents.length === 0) return

  const { supabase } = await import('@/lib/supabase/client')
  if (!supabase) {
    clearPendingIntents()
    return
  }

  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) {
    clearPendingIntents()
    return
  }

  const { followVenue, followPromoter } = await import('@/lib/userActions')
  const { addToWishlist, likeEvent } = await import('@/lib/userActions')
  const { setEventAction } = await import('@/lib/eventActions')

  for (const intent of intents) {
    try {
      if (intent.type === 'followVenue') {
        await followVenue(userId, intent.id)
      } else if (intent.type === 'followPromoter') {
        await followPromoter(userId, intent.id)
      } else if (intent.type === 'wishlistEvent') {
        await addToWishlist(userId, intent.id)
      } else if (intent.type === 'likeEvent') {
        await likeEvent(userId, intent.id)
      } else if (intent.type === 'goingEvent') {
        await setEventAction(userId, intent.id, 'going')
      } else if (intent.type === 'interestedEvent') {
        await setEventAction(userId, intent.id, 'interested')
      } else if (intent.type === 'reminderEvent') {
        await setEventAction(userId, intent.id, 'reminder', { reminder_hours_before: 24 })
      }
    } catch (e) {
      console.error('Failed to execute intent', intent, e)
    }
  }
  clearPendingIntents()
}
