/**
 * List pending friend requests (incoming + outgoing). Only for own profile.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

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

  const incoming: { id: string; requesterId: string; displayName?: string; avatarUrl?: string; username?: string }[] = []
  const outgoing: { id: string; addresseeId: string; displayName?: string; avatarUrl?: string; username?: string }[] = []

  if (rows) {
    const idsToFetch = [...new Set(rows.flatMap((r) => [r.requester_id, r.addressee_id]).filter((id) => id !== userId))]
    const { data: profiles } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, username')
      .in('id', idsToFetch)

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

    for (const r of rows) {
      const profile = profileMap.get(r.requester_id === userId ? r.addressee_id : r.requester_id)
      const p = profile ? {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        username: profile.username,
      } : {}
      if (r.addressee_id === userId) {
        incoming.push({ id: r.id, requesterId: r.requester_id, ...p })
      } else {
        outgoing.push({ id: r.id, addresseeId: r.addressee_id, ...p })
      }
    }
  }

  return NextResponse.json({ incoming, outgoing })
}
