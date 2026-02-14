/**
 * Get notification count for the current user.
 * Includes: incoming friend requests, (future: new events at followed venues, news)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, createAuthenticatedClient } from '@/lib/supabase/server'

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export async function GET(request: NextRequest) {
  const bearer = getBearer(request)
  if (!bearer) return NextResponse.json({ count: 0 })

  if (!supabaseServer) return NextResponse.json({ count: 0 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
  if (authError || !user) return NextResponse.json({ count: 0 })

  let count = 0

  try {
    const supabase = createAuthenticatedClient(bearer) ?? supabaseServer

    const { count: friendRequestsCount } = await supabase
      .from('friend_requests')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', user.id)
      .eq('status', 'pending')

    count += friendRequestsCount ?? 0

    // Future: new events at followed venues
    // Future: news / announcements
  } catch {
    // Ignore errors, return 0
  }

  return NextResponse.json({ count })
}
