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
      .select('id, display_name, avatar_url, bio, username, cover_url')
      .eq('id', userId)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
      supabaseServer.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      supabaseServer.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
    ])

    return NextResponse.json({
      id: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      username: profile.username,
      coverUrl: profile.cover_url,
      followersCount: followersCount ?? 0,
      followingCount: followingCount ?? 0,
    })
  } catch (e) {
    console.error('Profile API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
