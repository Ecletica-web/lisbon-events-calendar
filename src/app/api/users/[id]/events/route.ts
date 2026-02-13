/**
 * Get a user's events (Going, Saved, Liked) - respects event_visibility (public | friends_only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { fetchEvents } from '@/lib/eventsAdapter'
import type { NormalizedEvent } from '@/lib/eventsAdapter'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

function normId(id: string) {
  return (id || '').toLowerCase().trim()
}

function eventMatchesIdSet(e: NormalizedEvent, ids: Set<string>): boolean {
  const id = normId(e.id)
  if (id && ids.has(id)) return true
  const srcId = e.extendedProps?.sourceEventId
  if (srcId && ids.has(normId(srcId))) return true
  const dedupeKey = e.extendedProps?.dedupeKey
  if (dedupeKey && ids.has(normId(dedupeKey))) return true
  return false
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await context.params
  if (!targetUserId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  const bearer = getBearer(_request)
  const viewerId = bearer && supabaseServer
    ? (await supabaseServer.auth.getUser(bearer)).data.user?.id ?? null
    : null

  if (!supabaseServer) return NextResponse.json({ upcoming: [], past: [] })

  const { data: profile } = await supabaseServer
    .from('user_profiles')
    .select('event_visibility')
    .eq('id', targetUserId)
    .maybeSingle()

  const visibility = profile?.event_visibility ?? 'public'
  const isOwnProfile = viewerId === targetUserId

  let canSee = isOwnProfile
  if (!canSee && visibility === 'public') canSee = true
  if (!canSee && visibility === 'friends_only' && viewerId) {
    const orFilter = 'and(requester_id.eq.' + viewerId + ',addressee_id.eq.' + targetUserId + '),and(requester_id.eq.' + targetUserId + ',addressee_id.eq.' + viewerId + ')'
    const { data: fr } = await supabaseServer
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or(orFilter)
      .maybeSingle()
    canSee = !!fr
  }

  if (!canSee) {
    return NextResponse.json({ upcoming: [], past: [], visible: false })
  }

  const [eventActionsRes, likesRes, allEvents] = await Promise.all([
    supabaseServer.from('event_user_actions').select('event_id, action_type').eq('user_id', targetUserId).in('action_type', ['going', 'saved']),
    supabaseServer.from('user_like_events').select('event_id').eq('user_id', targetUserId),
    fetchEvents(),
  ])

  const goingIds = new Set<string>()
  const savedIds = new Set<string>()
  const likedIds = new Set<string>()
  eventActionsRes.data?.forEach((r) => {
    const eid = normId(r.event_id)
    if (eid) {
      if (r.action_type === 'going') goingIds.add(eid)
      else if (r.action_type === 'saved') savedIds.add(eid)
    }
  })
  likesRes.data?.forEach((r) => {
    const eid = normId(r.event_id)
    if (eid) likedIds.add(eid)
  })

  const allIds = new Set([...goingIds, ...savedIds, ...likedIds])
  const now = Date.now()

  const upcoming: NormalizedEvent[] = []
  const past: NormalizedEvent[] = []
  for (const e of allEvents) {
    if (!eventMatchesIdSet(e, allIds)) continue
    const t = new Date(e.start).getTime()
    if (t >= now) upcoming.push(e)
    else past.push(e)
  }

  upcoming.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  past.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

  return NextResponse.json({
    upcoming,
    past,
    visible: true,
  })
}
