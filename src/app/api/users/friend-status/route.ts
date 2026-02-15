/**
 * Batch friend status for multiple user IDs (one request instead of N).
 * Returns { statuses: { [userId]: 'friends' | 'pending_sent' | 'pending_received' | null } }
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, createAuthenticatedClient } from '@/lib/supabase/server'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

const MAX_IDS = 50

export async function GET(request: NextRequest) {
  const bearer = getBearer(request)
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseServer) return NextResponse.json({ statuses: {} })

  const idsParam = request.nextUrl.searchParams.get('ids')?.trim()
  const ids = idsParam
    ? idsParam.split(',').map((id) => id.trim()).filter(Boolean).slice(0, MAX_IDS)
    : []
  if (ids.length === 0) return NextResponse.json({ statuses: {} })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const viewerId = user.id

  const supabase = createAuthenticatedClient(bearer) ?? supabaseServer
  const statuses: Record<string, 'friends' | 'pending_sent' | 'pending_received' | null> = {}
  ids.forEach((id) => {
    if (id === viewerId) statuses[id] = null
    else statuses[id] = null
  })

  try {
    const [res1, res2] = await Promise.all([
      supabase
        .from('friend_requests')
        .select('requester_id, addressee_id, status')
        .eq('requester_id', viewerId)
        .in('addressee_id', ids),
      supabase
        .from('friend_requests')
        .select('requester_id, addressee_id, status')
        .eq('addressee_id', viewerId)
        .in('requester_id', ids),
    ])
    const rows = [...(res1.data ?? []), ...(res2.data ?? [])]
    for (const r of rows) {
      const otherId = r.requester_id === viewerId ? r.addressee_id : r.requester_id
      if (!ids.includes(otherId)) continue
      if (r.status === 'accepted') statuses[otherId] = 'friends'
      else if (r.requester_id === viewerId) statuses[otherId] = 'pending_sent'
      else statuses[otherId] = 'pending_received'
    }
  } catch (e) {
    console.error('Friend status batch error:', e)
  }

  return NextResponse.json({ statuses })
}
