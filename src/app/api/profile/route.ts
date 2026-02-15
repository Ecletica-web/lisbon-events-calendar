import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, createAuthenticatedClient } from '@/lib/supabase/server'
import { parseProfileUpdateBody } from '@/lib/profileApi'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export async function PATCH(request: NextRequest) {
  const bearer = getBearer(request)
  if (!bearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!supabaseServer) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const result = parseProfileUpdateBody(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const dbClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? supabaseServer
      : createAuthenticatedClient(bearer) ?? supabaseServer

    const { data, error } = await dbClient
      .from('user_profiles')
      .upsert(
        { id: user.id, ...result.updates, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      id: data.id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      bio: data.bio,
      username: data.username,
      coverUrl: data.cover_url,
    })
  } catch (e) {
    console.error('Profile PATCH error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
