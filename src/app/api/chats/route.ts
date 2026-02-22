import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { data: memberships } = await supabaseServer.from('chat_members').select('chat_id').eq('user_id', user.id)
  const chatIds = (memberships ?? []).map((m) => m.chat_id)
  if (chatIds.length === 0) return NextResponse.json({ chats: [] })

  const { data: chats, error } = await supabaseServer
    .from('chats')
    .select('id, name, is_group, created_at, updated_at')
    .in('id', chatIds)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const withMembers = await Promise.all(
    (chats ?? []).map(async (chat) => {
      const { data: members } = await supabaseServer.from('chat_members').select('user_id').eq('chat_id', chat.id)
      const userIds = (members ?? []).map((m) => m.user_id)
      const { data: profiles } = await supabaseServer.from('user_profiles').select('id, display_name, username, avatar_url').in('id', userIds)
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
      const membersList = userIds.map((id) => ({ id, displayName: profileMap.get(id)?.display_name ?? null, username: profileMap.get(id)?.username ?? null, avatarUrl: profileMap.get(id)?.avatar_url ?? null }))
      return { ...chat, members: membersList }
    })
  )
  return NextResponse.json({ chats: withMembers })
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  let body: { name?: string; memberIds?: string[] } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = typeof body.name === 'string' ? body.name.trim() || null : null
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((id) => typeof id === 'string' && id !== user.id) : []
  const isGroup = memberIds.length > 1 || (memberIds.length === 1 && !!name)

  const { data: chat, error: chatError } = await supabaseServer.from('chats').insert({ name: name || null, is_group: isGroup }).select('id, name, is_group, created_at').single()
  if (chatError || !chat) return NextResponse.json({ error: chatError?.message ?? 'Failed to create chat' }, { status: 500 })

  const allUserIds = [user.id, ...memberIds]
  const uniq = [...new Set(allUserIds)]
  const { error: membersError } = await supabaseServer.from('chat_members').insert(uniq.map((user_id) => ({ chat_id: chat.id, user_id })))
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 })

  return NextResponse.json({ chat: { ...chat, members: uniq.length } })
}
