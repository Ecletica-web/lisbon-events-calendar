import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const eventId = params?.id
  const viewerId = request.nextUrl.searchParams.get('viewerId')

  if (!eventId) {
    return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
  }

  if (!viewerId) {
    return NextResponse.json({ users: [] })
  }

  try {
    if (!supabaseServer) {
      return NextResponse.json({ users: [] })
    }

    const { data: goingRows } = await supabaseServer
      .from('user_interactions')
      .select('user_id')
      .eq('entity_type', 'event')
      .eq('entity_id', eventId.trim().toLowerCase())
      .eq('interaction_type', 'going')

    if (!goingRows || goingRows.length === 0) {
      return NextResponse.json({ users: [] })
    }

    const goingUserIds = [...new Set(goingRows.map((r) => r.user_id))]

    const { data: followRows } = await supabaseServer
      .from('follows')
      .select('following_id')
      .eq('follower_id', viewerId)
      .in('following_id', goingUserIds)

    if (!followRows || followRows.length === 0) {
      return NextResponse.json({ users: [] })
    }

    const friendIds = followRows.map((r) => r.following_id)
    const { data: profiles } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, username')
      .in('id', friendIds)

    const users = (profiles || []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      username: p.username,
    }))

    return NextResponse.json({ users })
  } catch (e) {
    console.error('Going friends API error:', e)
    return NextResponse.json({ users: [] })
  }
}
