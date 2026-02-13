import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/supabase/server'

function createUserClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
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

    // Use service role (bypasses RLS) when available; otherwise user-scoped client
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    const dbClient = hasServiceRole ? supabaseServer : createUserClient(bearer)
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (typeof body.cover_url === 'string') {
      updates.cover_url = body.cover_url || null
    }
    if (typeof body.username === 'string') {
      const u = body.username.trim().toLowerCase()
      if (u.length > 0) {
        if (u.length < 3 || u.length > 30) {
          return NextResponse.json(
            { error: 'Username must be 3–30 characters' },
            { status: 400 }
          )
        }
        if (!/^[a-z0-9_]+$/.test(u)) {
          return NextResponse.json(
            { error: 'Username can only contain lowercase letters, numbers, and underscores' },
            { status: 400 }
          )
        }
        updates.username = u
      } else {
        updates.username = null
      }
    }
    if (typeof body.bio === 'string') {
      const b = body.bio.trim()
      if (b.length > 200) {
        return NextResponse.json({ error: 'Bio must be 200 characters or less' }, { status: 400 })
      }
      updates.bio = b || null
    }
    if (typeof body.display_name === 'string') {
      updates.display_name = body.display_name.trim() || null
    }
    if (typeof body.avatar_url === 'string') {
      updates.avatar_url = body.avatar_url || null
    }
    if (typeof body.event_visibility === 'string' && ['public', 'friends_only'].includes(body.event_visibility)) {
      updates.event_visibility = body.event_visibility
    }

    // Onboarding preferences (standalone /onboarding page; not tied to auth flow)
    if (typeof body.onboarding_complete === 'boolean') {
      updates.onboarding_complete = body.onboarding_complete
    }
    if (typeof body.onboarding_intent === 'string') {
      updates.onboarding_intent = body.onboarding_intent.trim() || null
    }
    if (Array.isArray(body.onboarding_tags)) {
      updates.onboarding_tags = body.onboarding_tags.filter((t: unknown) => typeof t === 'string' && t.trim())
    }
    if (typeof body.onboarding_vibe === 'string') {
      updates.onboarding_vibe = body.onboarding_vibe.trim() || null
    }
    if (typeof body.onboarding_free_only === 'boolean') {
      updates.onboarding_free_only = body.onboarding_free_only
    }
    if (typeof body.onboarding_english_friendly === 'boolean') {
      updates.onboarding_english_friendly = body.onboarding_english_friendly
    }
    if (typeof body.onboarding_accessible === 'boolean') {
      updates.onboarding_accessible = body.onboarding_accessible
    }
    if (typeof body.onboarding_avoid_sold_out === 'boolean') {
      updates.onboarding_avoid_sold_out = body.onboarding_avoid_sold_out
    }
    if (typeof body.onboarding_near_me === 'boolean') {
      updates.onboarding_near_me = body.onboarding_near_me
    }
    if (typeof body.onboarding_lat === 'number') {
      updates.onboarding_lat = body.onboarding_lat
    }
    if (typeof body.onboarding_lng === 'number') {
      updates.onboarding_lng = body.onboarding_lng
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await dbClient
      .from('user_profiles')
      .upsert(
        { id: user.id, ...updates, updated_at: new Date().toISOString() },
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
