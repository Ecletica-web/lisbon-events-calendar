import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await context.params
  if (!eventId) {
    return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  let body: { recipientId?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : null
  if (!recipientId || recipientId === user.id) {
    return NextResponse.json({ error: 'Valid recipient required' }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from('event_shares')
    .insert({ sender_id: user.id, recipient_id: recipientId, event_id: eventId })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ success: true }) // already shared
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
