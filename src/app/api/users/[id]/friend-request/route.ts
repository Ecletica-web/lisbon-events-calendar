/**
 * Friend request: send, accept, reject, cancel
 * Uses service role for DB (bypasses RLS). Requires SUPABASE_SERVICE_ROLE_KEY in production.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, createAuthenticatedClient } from '@/lib/supabase/server'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await context.params
    if (!targetId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

    const bearer = getBearer(request)
    if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabaseServer) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
    if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const currentUserId = user.id
    if (currentUserId === targetId) return NextResponse.json({ error: 'Cannot send request to yourself' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const action = body?.action

    const supabase = createAuthenticatedClient(bearer) ?? supabaseServer

    const { data: existing } = await supabase
      .from('friend_requests')
      .select('id, requester_id, status')
      .eq('requester_id', targetId)
      .eq('addressee_id', currentUserId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing && action === 'accept') {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) {
        console.error('Friend request accept error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, action: 'accepted' })
    }

    const { data: ourRequest } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('requester_id', currentUserId)
      .eq('addressee_id', targetId)
      .maybeSingle()

    if (ourRequest) return NextResponse.json({ success: true, action: 'already_sent' })

    const { data: accepted } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or('and(requester_id.eq.' + currentUserId + ',addressee_id.eq.' + targetId + '),and(requester_id.eq.' + targetId + ',addressee_id.eq.' + currentUserId + ')')
      .maybeSingle()

    if (accepted) return NextResponse.json({ success: true, action: 'already_friends' })

    const { error } = await supabase
      .from('friend_requests')
      .upsert(
        { requester_id: currentUserId, addressee_id: targetId, status: 'pending', updated_at: new Date().toISOString() },
        { onConflict: 'requester_id,addressee_id' }
      )

    if (error) {
      console.error('Friend request upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, action: 'sent' })
  } catch (err) {
    console.error('Friend request POST error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: targetId } = await context.params
  if (!targetId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  const bearer = getBearer(request)
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!supabaseServer) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const supabase = createAuthenticatedClient(bearer) ?? supabaseServer
  const currentUserId = user.id
  const orFilter = 'and(requester_id.eq.' + currentUserId + ',addressee_id.eq.' + targetId + '),and(requester_id.eq.' + targetId + ',addressee_id.eq.' + currentUserId + ')'
  const { data: row } = await supabase
    .from('friend_requests')
    .select('id, requester_id, addressee_id, status')
    .or(orFilter)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'No request found' }, { status: 404 })

  if (row.status === 'pending') {
    if (row.addressee_id === currentUserId) {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase.from('friend_requests').delete().eq('id', row.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (row.status === 'accepted') {
    const { error } = await supabase.from('friend_requests').delete().eq('id', row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
