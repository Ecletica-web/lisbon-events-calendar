import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await context.params
  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  try {
    if (!supabaseServer) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, bio, username, cover_url, event_visibility')
      .eq('id', userId)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: friendRows } = await supabaseServer
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)

    const friendsCount = friendRows?.length ?? 0

    return NextResponse.json({
      id: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      username: profile.username,
      coverUrl: profile.cover_url,
      eventVisibility: profile.event_visibility ?? 'public',
      friendsCount,
    })
  } catch (e) {
    console.error('Profile API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
