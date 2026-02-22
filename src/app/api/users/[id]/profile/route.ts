import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PROFILE_IMAGES_BUCKET = 'profile-images'
const SIGNED_URL_EXPIRES = 3600 // 1 hour

/** Resolve profile image URL: path-only → full public URL; full Supabase URL → signed URL for private buckets. */
async function ensureViewableProfileImageUrl(url: string | null): Promise<string | null> {
  if (!url || !supabaseServer) return url
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (!supabaseUrl) return url

  let path: string | null = null

  if (!url.startsWith('http')) {
    path = url.replace(/^\//, '').trim()
    if (!path) return url
    const { data } = supabaseServer.storage.from(PROFILE_IMAGES_BUCKET).getPublicUrl(path)
    url = data.publicUrl
  }

  if (!url.includes(supabaseUrl) || !url.includes(`/${PROFILE_IMAGES_BUCKET}/`)) {
    return url
  }
  try {
    const pathname = new URL(url).pathname
    const bucketSegment = `/${PROFILE_IMAGES_BUCKET}/`
    const idx = pathname.indexOf(bucketSegment)
    path = path ?? (idx >= 0 ? pathname.slice(idx + bucketSegment.length) : null)
    if (!path) return url
    const { data, error } = await supabaseServer.storage
      .from(PROFILE_IMAGES_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRES)
    if (error || !data?.signedUrl) return url
    return data.signedUrl
  } catch {
    return url
  }
}

export async function GET(
  request: NextRequest,
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

    let viewerId: string | null = null
    const authHeader = request.headers.get('authorization')
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (bearer) {
      const { data: { user } } = await supabaseServer.auth.getUser(bearer)
      viewerId = user?.id ?? null
    }

    let profile: {
      id: string
      display_name: string | null
      avatar_url: string | null
      bio: string | null
      username: string | null
      cover_url: string | null
      event_visibility: string | null
      private_mode: boolean | null
    } | null = null
    let profileError: Error | null = null

    const { data: profileRow, error: profileErr } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, bio, username, cover_url, event_visibility, private_mode')
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
            private_mode: false,
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

    const isPrivate = profile.private_mode === true
    const isOwner = viewerId === profile.id
    if (isPrivate && !isOwner) {
      return NextResponse.json(
        { id: profile.id, isPrivate: true, displayName: null, avatarUrl: null, bio: null, username: null, coverUrl: null, eventVisibility: 'public', friendsCount: 0 },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
      )
    }

    const { data: friendRows } = await supabaseServer
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)

    const friendsCount = friendRows?.length ?? 0

    const [avatarUrl, coverUrl] = await Promise.all([
      ensureViewableProfileImageUrl(profile.avatar_url),
      ensureViewableProfileImageUrl(profile.cover_url),
    ])

    return NextResponse.json(
      {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl,
        bio: profile.bio,
        username: profile.username,
        coverUrl,
        eventVisibility: profile.event_visibility ?? 'public',
        friendsCount,
        isPrivate: false,
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
