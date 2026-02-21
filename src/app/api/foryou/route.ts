import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { fetchEvents, toCanonicalTagKey } from '@/lib/eventsAdapter'
import { fetchUserInteractionsBulk } from '@/lib/interactions'
import { getPersonalizedFeed, type UserFeedContext, type PersonaWeights } from '@/lib/recommendationEngine'

/** Uses request.headers (Authorization) and user-specific data — must not be statically rendered */
export const dynamic = 'force-dynamic'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

const norm = (s: string) => (s || '').toLowerCase().trim()

const FOR_YOU_LIMIT = 50

/** Fisher–Yates shuffle; returns a new array. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Random sample of upcoming events when user has no follows/likes/persona/friends signal. */
function randomUpcoming(upcoming: Awaited<ReturnType<typeof fetchEvents>>, limit: number): Awaited<ReturnType<typeof fetchEvents>> {
  if (upcoming.length <= limit) return upcoming
  return shuffle(upcoming).slice(0, limit)
}

/** True if the user has any signal we can use for personalization. */
function hasFeedSignals(
  bulk: Awaited<ReturnType<typeof import('@/lib/interactions').fetchUserInteractionsBulk>>,
  personaWeights: PersonaWeights | null,
  friendsGoingByEventId: Map<string, number>
): boolean {
  if (bulk.followedVenueIds.size > 0 || bulk.followedPromoterIds.size > 0) return true
  if (bulk.likedEventIds.size > 0 || bulk.wishlistedEventIds.size > 0) return true
  if (personaWeights?.includeTags?.length || personaWeights?.includeCategories?.length || personaWeights?.includeVenues?.length) return true
  if (friendsGoingByEventId.size > 0) return true
  return false
}

export async function GET(request: NextRequest) {
  try {
    const bearer = getBearer(request)
    const personaRulesParam = request.nextUrl.searchParams.get('personaRules')
    let personaWeights: PersonaWeights | null = null
    if (personaRulesParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(personaRulesParam)) as PersonaWeights
        personaWeights = {
          includeTags: parsed.includeTags,
          includeCategories: parsed.includeCategories,
          includeVenues: parsed.includeVenues,
          prefer_free: parsed.prefer_free,
          energy_level: parsed.energy_level,
          neighborhoods: parsed.neighborhoods,
          time_preference: parsed.time_preference,
        }
      } catch (_) {}
    }

    const events = await fetchEvents()
    const upcoming = events.filter((e) => e.start >= new Date().toISOString())

    if (!bearer || !supabaseServer) {
      return NextResponse.json({
        events: randomUpcoming(upcoming, FOR_YOU_LIMIT),
        reasons: {},
      })
    }

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
    if (authError || !user) {
      return NextResponse.json({ events: randomUpcoming(upcoming, FOR_YOU_LIMIT), reasons: {} })
    }

    const userId = user.id
    const bulk = await fetchUserInteractionsBulk(userId)

    const { data: friendRows } = await supabaseServer
      .from('friend_requests')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)
    const friendIds = (friendRows || []).map((r) =>
      r.requester_id === userId ? r.addressee_id : r.requester_id
    )

    const friendsGoingByEventId = new Map<string, number>()
    if (friendIds.length > 0) {
      const { data: goingRows } = await supabaseServer
        .from('user_interactions')
        .select('entity_id, user_id')
        .eq('entity_type', 'event')
        .eq('interaction_type', 'going')
        .in('user_id', friendIds)
      const eventToCount = new Map<string, number>()
      goingRows?.forEach((r) => {
        const eid = norm(r.entity_id)
        eventToCount.set(eid, (eventToCount.get(eid) || 0) + 1)
      })
      eventToCount.forEach((count, eid) => friendsGoingByEventId.set(eid, count))
    }

    const likedCategories = new Set<string>()
    const likedEventIds = bulk.likedEventIds
    upcoming.forEach((e) => {
      if (likedEventIds.has(e.id) && e.extendedProps.category) {
        likedCategories.add(e.extendedProps.category.toLowerCase())
      }
    })

    const savedTagSet = new Set<string>()
    if (personaWeights?.includeTags?.length) {
      personaWeights.includeTags.forEach((t) => {
        const key = toCanonicalTagKey(t)
        if (key) savedTagSet.add(key)
      })
    }

    const ctx: UserFeedContext = {
      followedVenueIds: bulk.followedVenueIds,
      followedPromoterIds: bulk.followedPromoterIds,
      likedEventIds: bulk.likedEventIds,
      likedCategories,
      personaWeights,
      friendsGoingByEventId,
      savedTagSet,
      freeEventAttendenceScore: bulk.wishlistedEventIds.size > 0 ? 0.5 : 0,
    }

    const feed = hasFeedSignals(bulk, personaWeights, friendsGoingByEventId)
      ? getPersonalizedFeed(upcoming, ctx, { limit: FOR_YOU_LIMIT, upcomingOnly: true })
      : randomUpcoming(upcoming, FOR_YOU_LIMIT)

    const reasons: Record<string, string[]> = {}
    feed.forEach((event) => {
      const r: string[] = []
      const v = norm(event.extendedProps.venueId || event.extendedProps.venueKey || '')
      const p = norm(event.extendedProps.promoterId || event.extendedProps.promoterName || '')
      if (v && bulk.followedVenueIds.has(v)) r.push('Followed venue')
      if (p && bulk.followedPromoterIds.has(p)) r.push('Followed promoter')
      if (personaWeights && personaWeights.includeTags?.length) r.push('Matches your vibe')
      const fc = friendsGoingByEventId.get(event.id)
      if (fc && fc > 0) r.push(`${fc} friend${fc !== 1 ? 's' : ''} going`)
      if (event.extendedProps.isFree && personaWeights?.prefer_free) r.push('Free event')
      if (event.extendedProps.category && likedCategories.has(event.extendedProps.category.toLowerCase())) {
        r.push('Because you liked similar events')
      }
      if (r.length) reasons[event.id] = r
    })

    return NextResponse.json({ events: feed, reasons })
  } catch (e) {
    console.error('For You API error:', e)
    return NextResponse.json({ events: [], reasons: {} })
  }
}
