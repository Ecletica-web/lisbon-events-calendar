import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { profileDisplayName } from '@/lib/profileDisplayName'
import { ensureViewableProfileImageUrl } from '@/lib/profileImageUrls'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? ''
  const browse = request.nextUrl.searchParams.get('browse') === '1'
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 20, 50)

  try {
    if (!supabaseServer) {
      return NextResponse.json({ users: [] })
    }

    // Browse mode: return a list of existing users when query is empty
    if (browse || (q.length === 0 && request.nextUrl.searchParams.has('browse'))) {
      const { data, error } = await supabaseServer
        .from('user_profiles')
        .select('id, display_name, name, avatar_url, username')
        .limit(limit)
        .order('updated_at', { ascending: false })

      if (error) return NextResponse.json({ users: [] })
      const users = await Promise.all(
        (data || []).map(async (p) => ({
          id: p.id,
          displayName: profileDisplayName(p),
          avatarUrl: await ensureViewableProfileImageUrl(p.avatar_url),
          username: p.username,
        }))
      )
      return NextResponse.json({ users })
    }

    if (q.length < 1) {
      return NextResponse.json({ users: [] })
    }

    // Prefix match (starts with): escape ilike wildcards so user input is literal
    const safe = q.replace(/[%_\\]/g, '')
    const pattern = `${safe}%`
    const { data, error } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, name, avatar_url, username')
      .or(`username.ilike.${pattern},display_name.ilike.${pattern},name.ilike.${pattern}`)
      .limit(limit)

    if (error) {
      return NextResponse.json({ users: [] })
    }

    const users = await Promise.all(
      (data || []).map(async (p) => ({
        id: p.id,
        displayName: profileDisplayName(p),
        avatarUrl: await ensureViewableProfileImageUrl(p.avatar_url),
        username: p.username,
      }))
    )

    return NextResponse.json({ users })
  } catch (e) {
    console.error('User search error:', e)
    return NextResponse.json({ users: [] })
  }
}
