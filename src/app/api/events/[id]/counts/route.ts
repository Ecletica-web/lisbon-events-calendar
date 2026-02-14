import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const eventId = params?.id
  if (!eventId) {
    return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
  }

  try {
    if (!supabaseServer) {
      return NextResponse.json({ goingCount: 0, interestedCount: 0 })
    }

    const [goingRes, interestedRes] = await Promise.all([
      supabaseServer
        .from('user_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('entity_type', 'event')
        .eq('entity_id', eventId.trim().toLowerCase())
        .eq('interaction_type', 'going'),
      supabaseServer
        .from('user_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('entity_type', 'event')
        .eq('entity_id', eventId.trim().toLowerCase())
        .eq('interaction_type', 'interested'),
    ])

    return NextResponse.json({
      goingCount: goingRes.error ? 0 : (goingRes.count ?? 0),
      interestedCount: interestedRes.error ? 0 : (interestedRes.count ?? 0),
    })
  } catch (e) {
    console.error('Event counts error:', e)
    return NextResponse.json({ goingCount: 0, interestedCount: 0 })
  }
}
