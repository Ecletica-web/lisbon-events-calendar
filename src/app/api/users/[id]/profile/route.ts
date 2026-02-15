import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

    let profile: {
      id: string
      display_name: string | null
      avatar_url: string | null
      bio: string | null
      username: string | null
      cover_url: string | null
      event_visibility: string | null
    } | null = null
    let profileError: Error | null = null

    const { data: profileRow, error: profileErr } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, bio, username, cover_url, event_visibility')
      .eq('id', userId)
      .maybeSingle()
    profile = profileRow
    profileError = profileErr

    // If no user_profiles row, try Auth Admin (user may exist but profile never created)
    if (!profile && !profileError) {
      try {
        const { data: { user: authUser }, error: authErr } = await supabaseServer.auth.admin.getUserById(userId)
        if (!authErr && authUser) {
          const name = authUser.user_metadata?.name ?? authUser.user_metadata?.full_name ?? authUser.email ?? null
          profile = {
            id: authUser.id,
            display_name: name,
            avatar_url: authUser.user_metadata?.avatar_url ?? null,
            bio: null,
            username: authUser.user_metadata?.user_name ?? null,
            cover_url: null,
            event_visibility: 'public',
          }
          // Create user_profiles row so future requests and profile edits work (service role bypasses RLS)
          await supabaseServer
            .from('user_profiles')
            .upsert(
              {
                id: authUser.id,
                email: authUser.email ?? null,
                name: name,
                display_name: name,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'id' }
            )
        }
      } catch {
        // ignore; we'll return 404 below
      }
    }

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: friendRows } = await supabaseServer
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)

    const friendsCount = friendRows?.length ?? 0

    return NextResponse.json(
      {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        bio: profile.bio,
        username: profile.username,
        coverUrl: profile.cover_url,
        eventVisibility: profile.event_visibility ?? 'public',
        friendsCount,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    )
  } catch (e) {
    console.error('Profile API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
