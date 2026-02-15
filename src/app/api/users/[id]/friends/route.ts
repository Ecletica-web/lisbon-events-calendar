/**
 * List friends (accepted friend requests)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await context.params
  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  if (!supabaseServer) return NextResponse.json({ friends: [] })

  const { data: rows, error: frError } = await supabaseServer
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

  const { data: profiles } = await supabaseServer
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
