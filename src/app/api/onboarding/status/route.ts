/**
 * GET /api/onboarding/status
 * Returns saved onboarding preferences for the authenticated user (Supabase).
 * Used when editing preferences from Settings. Guests use localStorage.
 */

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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer) {
    return NextResponse.json({ preferences: null }, { status: 200 })
  }

  try {
    if (!supabaseServer) {
      return NextResponse.json({ preferences: null }, { status: 200 })
    }

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
    if (authError || !user) {
      return NextResponse.json({ preferences: null }, { status: 200 })
    }

    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    const dbClient = hasServiceRole ? supabaseServer : createUserClient(bearer)

    const { data } = await dbClient
      .from('user_profiles')
      .select(
        'onboarding_complete, onboarding_intent, onboarding_tags, onboarding_vibe, ' +
        'onboarding_free_only, onboarding_english_friendly, onboarding_accessible, ' +
        'onboarding_avoid_sold_out, onboarding_near_me, onboarding_lat, onboarding_lng'
      )
      .eq('id', user.id)
      .single()

    const profile = data as Record<string, unknown> | null
    if (!profile) {
      return NextResponse.json({ preferences: null }, { status: 200 })
    }

    const preferences = {
      onboardingComplete: !!profile.onboarding_complete,
      intent: (profile.onboarding_intent as string) ?? undefined,
      tags: Array.isArray(profile.onboarding_tags) ? profile.onboarding_tags : [],
      vibe: (profile.onboarding_vibe as string) ?? undefined,
      freeOnly: !!profile.onboarding_free_only,
      englishFriendly: !!profile.onboarding_english_friendly,
      accessible: !!profile.onboarding_accessible,
      avoidSoldOut: !!profile.onboarding_avoid_sold_out,
      nearMe: !!profile.onboarding_near_me,
      lat: typeof profile.onboarding_lat === 'number' ? profile.onboarding_lat : undefined,
      lng: typeof profile.onboarding_lng === 'number' ? profile.onboarding_lng : undefined,
    }

    return NextResponse.json({ preferences })
  } catch (e) {
    console.error('Onboarding status error:', e)
    return NextResponse.json({ preferences: null }, { status: 200 })
  }
}
