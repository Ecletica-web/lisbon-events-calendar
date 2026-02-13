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
      return NextResponse.json({ following: [] })
    }

    const { data: rows } = await supabaseServer
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)

    if (!rows || rows.length === 0) {
      return NextResponse.json({ following: [] })
    }

    const ids = [...new Set(rows.map((r) => r.following_id))]
    const { data: profiles } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, username')
      .in('id', ids)

    const following = (profiles || []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      username: p.username,
    }))

    return NextResponse.json({ following })
  } catch (e) {
    console.error('Following API error:', e)
    return NextResponse.json({ following: [] })
  }
}
