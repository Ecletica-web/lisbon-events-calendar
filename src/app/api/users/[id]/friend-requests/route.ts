/**
 * List pending friend requests (incoming + outgoing). Only for own profile.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { profileDisplayName } from '@/lib/profileDisplayName'
import { ensureViewableProfileImageUrl } from '@/lib/profileImageUrls'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await context.params
  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  const bearer = getBearer(_request)
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!supabaseServer) return NextResponse.json({ incoming: [], outgoing: [] })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
  if (authError || !user || user.id !== userId) {
    return NextResponse.json({ error: 'Can only view your own friend requests' }, { status: 403 })
  }

  const { data: rows } = await supabaseServer
    .from('friend_requests')
    .select('id, requester_id, addressee_id, status, created_at')
    .eq('status', 'pending')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

  const incoming: {
    id: string
    requesterId: string
    displayName?: string | null
    avatarUrl?: string | null
    username?: string | null
  }[] = []
  const outgoing: {
    id: string
    addresseeId: string
    displayName?: string | null
    avatarUrl?: string | null
    username?: string | null
  }[] = []

  if (rows) {
    const idsToFetch = [
      ...new Set(rows.flatMap((r) => [r.requester_id, r.addressee_id]).filter((id) => id !== userId)),
    ]
    const { data: profiles } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, name, avatar_url, username')
      .in('id', idsToFetch)

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

    for (const r of rows) {
      const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id
      const profile = profileMap.get(otherId)
      const p = {
        displayName: profileDisplayName(profile),
        avatarUrl: await ensureViewableProfileImageUrl(profile?.avatar_url ?? null),
        username: profile?.username ?? null,
      }
      if (r.addressee_id === userId) {
        incoming.push({ id: r.id, requesterId: r.requester_id, ...p })
      } else {
        outgoing.push({ id: r.id, addresseeId: r.addressee_id, ...p })
      }
    }
  }

  return NextResponse.json({ incoming, outgoing })
}
