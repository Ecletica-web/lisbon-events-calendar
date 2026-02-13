const PENDING_INTENTS_KEY = 'lisbon-events-pending-intents'

export type IntentType = 'followVenue' | 'followPromoter' | 'wishlistEvent' | 'likeEvent'

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

  const execute = async (intent: PendingIntent) => {
    const base = '/api/user-actions'
    if (intent.type === 'followVenue') {
      await fetch(`${base}/follow-venue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId: intent.id }),
      })
    } else if (intent.type === 'followPromoter') {
      await fetch(`${base}/follow-promoter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoterId: intent.id }),
      })
    } else if (intent.type === 'wishlistEvent') {
      await fetch(`${base}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: intent.id }),
      })
    } else if (intent.type === 'likeEvent') {
      await fetch(`${base}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: intent.id }),
      })
    }
  }

  for (const intent of intents) {
    try {
      await execute(intent)
    } catch (e) {
      console.error('Failed to execute intent', intent, e)
    }
  }
  clearPendingIntents()
}
