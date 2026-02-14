/**
 * Social proof: why we're showing this event. Used on cards and modal.
 */

import type { NormalizedEvent } from './eventsAdapter'
import { toCanonicalTagKey } from './eventsAdapter'

export interface EventReasonsContext {
  followedVenueIds: Set<string>
  followedPromoterIds: Set<string>
  friendsGoingCount?: number
  activePersonaName?: string
  likedSimilarCategory?: boolean
  isFreeAndPreferFree?: boolean
}

const norm = (s: string | undefined) => (s || '').toLowerCase().trim()

export function getEventReasons(event: NormalizedEvent, ctx: EventReasonsContext): string[] {
  const reasons: string[] = []
  const venueId = norm(event.extendedProps.venueId || event.extendedProps.venueKey || '')
  const promoterId = norm(event.extendedProps.promoterId || event.extendedProps.promoterName || '')

  if (venueId && ctx.followedVenueIds.has(venueId)) {
    reasons.push('Followed venue')
  }
  if (promoterId && ctx.followedPromoterIds.has(promoterId)) {
    reasons.push('Followed promoter')
  }
  if (ctx.friendsGoingCount != null && ctx.friendsGoingCount > 0) {
    reasons.push(`${ctx.friendsGoingCount} friend${ctx.friendsGoingCount !== 1 ? 's' : ''} going`)
  }
  if (ctx.activePersonaName) {
    reasons.push(`Matches ${ctx.activePersonaName} persona`)
  }
  if (ctx.likedSimilarCategory) {
    reasons.push('Because you liked similar events')
  }
  if (ctx.isFreeAndPreferFree && event.extendedProps.isFree) {
    reasons.push('Free event')
  }

  return reasons
}
