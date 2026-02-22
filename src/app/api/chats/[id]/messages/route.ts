import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
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

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 100)
  const before = request.nextUrl.searchParams.get('before')

  let query = supabaseServer
    .from('chat_messages')
    .select('id, chat_id, sender_id, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)
  const { data: messages, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const senderIds = [...new Set((messages ?? []).map((m) => m.sender_id))]
  const { data: profiles } = await supabaseServer
    .from('user_profiles')
    .select('id, display_name, username')
    .in('id', senderIds)
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  const list = (messages ?? []).reverse().map((m) => ({
    id: m.id,
    chatId: m.chat_id,
    senderId: m.sender_id,
    content: m.content,
    createdAt: m.created_at,
    senderName: profileMap.get(m.sender_id)?.display_name ?? profileMap.get(m.sender_id)?.username ?? null,
  }))

  return NextResponse.json({ messages: list })
}

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

  let body: { content?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const { data: msg, error } = await supabaseServer
    .from('chat_messages')
    .insert({ chat_id: chatId, sender_id: user.id, content })
    .select('id, chat_id, sender_id, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseServer.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId)

  return NextResponse.json({
    message: {
      id: msg.id,
      chatId: msg.chat_id,
      senderId: msg.sender_id,
      content: msg.content,
      createdAt: msg.created_at,
    },
  })
}
