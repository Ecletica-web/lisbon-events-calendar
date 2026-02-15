/**
 * List friends (accepted friend requests).
 * Uses authenticated client when Bearer token is sent so RLS allows reading friend_requests.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, createAuthenticatedClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await context.params
  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  if (!supabaseServer) return NextResponse.json({ friends: [] })

  const bearer = getBearer(request)
  let supabase = supabaseServer
  if (bearer) {
    const { data: { user } } = await supabaseServer.auth.getUser(bearer)
    // When viewing another user's profile, use server client (service role) so we can read their friends; RLS would otherwise only return rows involving the viewer.
    if (user && user.id === userId) {
      const authClient = createAuthenticatedClient(bearer) ?? supabaseServer
      supabase = authClient
    }
  }

  const { data: rows, error: frError } = await supabase
    .from('friend_requests')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)

  if (frError) {
    console.error('Friends list fetch error:', frError)
    return NextResponse.json({ friends: [], error: frError.message }, { status: 500 })
  }

  const friendIds = (rows || [])
    .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
    .filter(Boolean)

  if (friendIds.length === 0) return NextResponse.json({ friends: [] })

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url, username')
    .in('id', friendIds)

  const profileMap = new Map(
    (profiles || []).map((p) => [
      p.id,
      { displayName: p.display_name, avatarUrl: p.avatar_url, username: p.username },
    ])
  )

  const friends = friendIds.map((id) => {
    const p = profileMap.get(id)
    return {
      id,
      displayName: p?.displayName ?? null,
      avatarUrl: p?.avatarUrl ?? null,
      username: p?.username ?? null,
    }
  })

  return NextResponse.json({ friends })
}
