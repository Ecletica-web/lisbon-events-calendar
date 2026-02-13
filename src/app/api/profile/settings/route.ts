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

    const { data: profile } = await supabaseServer
      .from('user_profiles')
      .select('email_notifications, digest_frequency, notification_timezone, notify_venues, notify_personas, notify_promoters')
      .eq('id', user.id)
      .maybeSingle()

    return NextResponse.json({
      settings: {
        email_enabled: profile?.email_notifications ?? false,
        digest_frequency: profile?.digest_frequency || 'weekly',
        instant_enabled: false,
        timezone: profile?.notification_timezone || 'Europe/Lisbon',
        notify_venues: profile?.notify_venues ?? false,
        notify_personas: profile?.notify_personas ?? false,
        notify_promoters: profile?.notify_promoters ?? false,
      },
    })
  } catch (e) {
    console.error('Profile settings GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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

    const body = await request.json()
    const updates: Record<string, unknown> = { id: user.id, updated_at: new Date().toISOString() }

    if (typeof body.email_enabled === 'boolean') updates.email_notifications = body.email_enabled
    if (typeof body.digest_frequency === 'string' && ['daily', 'weekly', 'never'].includes(body.digest_frequency)) {
      updates.digest_frequency = body.digest_frequency
    }
    if (typeof body.timezone === 'string') updates.notification_timezone = body.timezone
    if (typeof body.notify_venues === 'boolean') updates.notify_venues = body.notify_venues
    if (typeof body.notify_personas === 'boolean') updates.notify_personas = body.notify_personas
    if (typeof body.notify_promoters === 'boolean') updates.notify_promoters = body.notify_promoters

    const userClient = createUserClient(bearer)
    const { data, error } = await userClient
      .from('user_profiles')
      .upsert(updates, { onConflict: 'id' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      settings: {
        email_enabled: data?.email_notifications ?? false,
        digest_frequency: data?.digest_frequency || 'weekly',
        instant_enabled: false,
        timezone: data?.notification_timezone || 'Europe/Lisbon',
        notify_venues: data?.notify_venues ?? false,
        notify_personas: data?.notify_personas ?? false,
        notify_promoters: data?.notify_promoters ?? false,
      },
    })
  } catch (e) {
    console.error('Profile settings PATCH error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
