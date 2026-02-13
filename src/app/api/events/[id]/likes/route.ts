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
      return NextResponse.json({ count: 0 })
    }

    const { count, error } = await supabaseServer
      .from('user_like_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)

    if (error) {
      console.error('Like count error:', error)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (e) {
    console.error('Like count error:', e)
    return NextResponse.json({ count: 0 })
  }
}
