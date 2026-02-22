import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await context.params
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user } } = await supabaseServer.auth.getUser(bearer)
  if (!user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { data: member } = await supabaseServer
    .from('chat_members')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  let body: { userId?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : null
  if (!userId || userId === user.id) {
    return NextResponse.json({ error: 'Valid userId required' }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from('chat_members')
    .insert({ chat_id: chatId, user_id: userId })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ success: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
