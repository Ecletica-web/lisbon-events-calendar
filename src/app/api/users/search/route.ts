import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase()
  if (!q || q.length < 2) {
    return NextResponse.json({ users: [] })
  }

  try {
    if (!supabaseServer) {
      return NextResponse.json({ users: [] })
    }

    const { data, error } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, avatar_url, username')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20)

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
