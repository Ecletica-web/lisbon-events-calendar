import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

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
        .select('id, display_name, avatar_url, username')
        .limit(limit)
        .order('updated_at', { ascending: false })

      if (error) return NextResponse.json({ users: [] })
      const users = (data || []).map((p) => ({
        id: p.id,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
        username: p.username,
      }))
      return NextResponse.json({ users })
    }

    if (q.length < 2) {
      return NextResponse.json({ users: [] })
    }

    const { data, error } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, username')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(limit)

    if (error) {
      return NextResponse.json({ users: [] })
    }

    const users = (data || []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      username: p.username,
    }))

    return NextResponse.json({ users })
  } catch (e) {
    console.error('User search error:', e)
    return NextResponse.json({ users: [] })
  }
}
