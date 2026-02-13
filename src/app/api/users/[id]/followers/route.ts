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
      return NextResponse.json({ followers: [] })
    }

    const { data: rows } = await supabaseServer
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId)

    if (!rows || rows.length === 0) {
      return NextResponse.json({ followers: [] })
    }

    const ids = [...new Set(rows.map((r) => r.follower_id))]
    const { data: profiles } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, username')
      .in('id', ids)

    const followers = (profiles || []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      username: p.username,
    }))

    return NextResponse.json({ followers })
  } catch (e) {
    console.error('Followers API error:', e)
    return NextResponse.json({ followers: [] })
  }
}
