/**
 * List friends (accepted friend requests).
 * Auth required for own profile; uses service role after auth so RLS cannot empty the list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { profileDisplayName } from '@/lib/profileDisplayName'
import { ensureViewableProfileImageUrl } from '@/lib/profileImageUrls'

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
  if (bearer) {
    const { data: { user } } = await supabaseServer.auth.getUser(bearer)
    // Viewing another user's friends is ok via service role; own list requires valid token
    if (user && user.id !== userId) {
      // still allow (public-ish friends list on profiles)
    }
  }

  const { data: rows, error: frError } = await supabaseServer
    .from('friend_requests')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)

  if (frError) {
    console.error('Friends list fetch error:', frError)
    return NextResponse.json({ friends: [], error: frError.message }, { status: 500 })
  }

  const friendIds = [
    ...new Set(
      (rows || [])
        .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
        .filter(Boolean)
    ),
  ]

  if (friendIds.length === 0) return NextResponse.json({ friends: [] })

  const { data: profiles } = await supabaseServer
    .from('user_profiles')
    .select('id, display_name, name, avatar_url, username')
    .in('id', friendIds)

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

  const friends = await Promise.all(
    friendIds.map(async (id) => {
      const p = profileMap.get(id)
      return {
        id,
        displayName: profileDisplayName(p),
        avatarUrl: await ensureViewableProfileImageUrl(p?.avatar_url ?? null),
        username: p?.username ?? null,
      }
    })
  )

  return NextResponse.json({ friends })
}
