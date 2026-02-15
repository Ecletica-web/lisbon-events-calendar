import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { fetchEvents, toCanonicalTagKey } from '@/lib/eventsAdapter'
import { fetchUserInteractionsBulk } from '@/lib/interactions'
import { getPersonalizedFeed, type UserFeedContext, type PersonaWeights } from '@/lib/recommendationEngine'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

const norm = (s: string) => (s || '').toLowerCase().trim()

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
        events: upcoming.slice(0, 50),
        reasons: {},
      })
    }

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
    if (authError || !user) {
      return NextResponse.json({ events: upcoming.slice(0, 50), reasons: {} })
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

    const feed = getPersonalizedFeed(upcoming, ctx, { limit: 50, upcomingOnly: true })

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
