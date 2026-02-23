'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'

interface ChatMember {
  id: string
  displayName?: string | null
  username?: string | null
  avatarUrl?: string | null
}

interface Chat {
  id: string
  name?: string | null
  is_group: boolean
  created_at: string
  updated_at: string
  members: ChatMember[]
}

interface Message {
  id: string
  chatId: string
  senderId: string
  content: string
  createdAt: string
  senderName?: string | null
}

function chatTitle(chat: Chat, currentUserId: string) {
  if (chat.name) return chat.name
  const others = chat.members.filter((m) => m.id !== currentUserId)
  if (others.length === 0) return 'Chat'
  return others.map((m) => m.displayName || m.username || 'User').join(', ')
}

export default function ChatPage() {
  const auth = useSupabaseAuth()
  const user = auth?.user
  const searchParams = useSearchParams()
  const withUserId = searchParams.get('with')
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatMode, setNewChatMode] = useState<'dm' | 'group'>('group')
  const [friends, setFriends] = useState<ChatMember[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const getAuthHeaders = useCallback(async () => {
    const { supabase } = await import('@/lib/supabase/client')
    const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }, [])

  const fetchChats = useCallback(async () => {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return
    const res = await fetch('/api/chats', { headers })
    const data = await res.json().catch(() => ({}))
    setChats(data.chats ?? [])
  }, [getAuthHeaders])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let cancelled = false
    getAuthHeaders().then((headers) => {
      if (!headers.Authorization || cancelled) return
      fetch('/api/chats', { headers })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setChats(d.chats ?? []) })
        .finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true }
  }, [user, getAuthHeaders])

  // Open DM when visiting /chat?with=userId (e.g. from a friend's profile)
  const withUserIdHandled = useRef(false)
  useEffect(() => {
    if (!user || !withUserId || withUserId === user.id || loading || withUserIdHandled.current) return
    const existing = chats.find(
      (c) =>
        !c.is_group &&
        c.members.length === 2 &&
        c.members.some((m) => m.id === withUserId)
    )
    if (existing) {
      setSelectedId(existing.id)
      withUserIdHandled.current = true
      return
    }
    withUserIdHandled.current = true
    const headersPromise = getAuthHeaders()
    headersPromise.then((headers) => {
      if (!headers.Authorization) return
      fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ memberIds: [withUserId] }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then(async (data) => {
          if (data?.chat?.id) {
            await fetchChats()
            setSelectedId(data.chat.id)
          }
        })
    })
  }, [user, withUserId, loading, chats, getAuthHeaders, fetchChats])

  useEffect(() => {
    if (!selectedId || !user) {
      setMessages([])
      return
    }
    setLoadingMessages(true)
    getAuthHeaders().then((headers) => {
      if (!headers.Authorization) return
      fetch(`/api/chats/${selectedId}/messages`, { headers })
        .then((r) => r.json())
        .then((d) => setMessages(d.messages ?? []))
        .finally(() => setLoadingMessages(false))
    })
  }, [selectedId, user, getAuthHeaders])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const content = newMessage.trim()
    if (!content || !selectedId || sending) return
    setSending(true)
    const headers = await getAuthHeaders()
    if (!headers.Authorization) { setSending(false); return }
    try {
      const res = await fetch(`/api/chats/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [...prev, data.message])
        setNewMessage('')
        fetchChats()
      }
    } finally {
      setSending(false)
    }
  }

  const openNewChat = async (mode: 'dm' | 'group') => {
    if (!user) return
    setNewChatMode(mode)
    setShowNewChat(true)
    setSelectedFriendIds(new Set())
    setNewGroupName('')
    setFriendsLoading(true)
    setFriends([])
    const headers = await getAuthHeaders()
    if (!headers.Authorization) {
      setFriendsLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/users/${user.id}/friends`, { headers, cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      const list = res.ok && Array.isArray(data.friends) ? data.friends : []
      setFriends(list)
    } finally {
      setFriendsLoading(false)
    }
  }

  const startDmWith = async (friend: ChatMember) => {
    if (!user || creating) return
    const existing = chats.find(
      (c) =>
        !c.is_group &&
        c.members.length === 2 &&
        c.members.some((m) => m.id === friend.id)
    )
    if (existing) {
      setSelectedId(existing.id)
      setShowNewChat(false)
      return
    }
    setCreating(true)
    const headers = await getAuthHeaders()
    if (!headers.Authorization) {
      setCreating(false)
      return
    }
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ memberIds: [friend.id] }),
      })
      if (res.ok) {
        const data = await res.json()
        await fetchChats()
        setSelectedId(data.chat.id)
        setShowNewChat(false)
      }
    } finally {
      setCreating(false)
    }
  }

  const createGroup = async () => {
    if (!user || creating) return
    const ids = [...selectedFriendIds]
    if (ids.length === 0) return
    setCreating(true)
    const headers = await getAuthHeaders()
    if (!headers.Authorization) { setCreating(false); return }
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: newGroupName.trim() || undefined, memberIds: ids }),
      })
      if (res.ok) {
        const data = await res.json()
        await fetchChats()
        setSelectedId(data.chat.id)
        setShowNewChat(false)
      }
    } finally {
      setCreating(false)
    }
  }

  const toggleFriend = (id: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <p className="text-slate-400 mb-4">Sign in to use Chat</p>
        <Link href="/login" className="text-indigo-400 hover:underline">Log in</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col pt-16 pb-8">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col md:flex-row gap-0 md:gap-4 px-2">
        <aside className="w-full md:w-72 flex-shrink-0 border border-slate-700/50 rounded-xl bg-slate-800/50 overflow-hidden flex flex-col max-h-[40vh] md:max-h-[calc(100vh-8rem)]">
          <div className="p-3 border-b border-slate-700/50">
            <h1 className="font-semibold text-white">Chats</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Message a friend, create a group, or share events from the calendar.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => openNewChat('dm')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-medium"
              >
                Message friend
              </button>
              <button
                type="button"
                onClick={() => openNewChat('group')}
                className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/80 text-xs font-medium"
              >
                New group
              </button>
            </div>
          </div>
          <ul className="overflow-y-auto flex-1">
            {loading ? (
              <li className="p-4 text-slate-500 text-sm">Loading...</li>
            ) : chats.length === 0 ? (
              <li className="p-4 text-slate-500 text-sm">No chats yet. Message a friend or create a group to start.</li>
            ) : (
              chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(chat.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-700/50 ${selectedId === chat.id ? 'bg-slate-700/80' : ''}`}
                  >
                    <span className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-slate-200 font-medium flex-shrink-0">
                      {chat.is_group ? '#' : (chatTitle(chat, user.id)[0] || '?').toUpperCase()}
                    </span>
                    <span className="text-slate-200 truncate">{chatTitle(chat, user.id)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="flex-1 flex flex-col min-h-0 border border-slate-700/50 rounded-xl bg-slate-800/30 overflow-hidden mt-4 md:mt-0">
          {selectedId ? (
            <>
              <div className="p-3 border-b border-slate-700/50 text-slate-200 font-medium">
                {chatTitle(chats.find((c) => c.id === selectedId) ?? { id: '', name: null, is_group: false, created_at: '', updated_at: '', members: [] }, user.id)}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <p className="text-slate-500 text-sm">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="text-slate-500 text-sm">No messages yet. Say hi!</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.senderId === user.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-xl px-4 py-2 ${m.senderId === user.id ? 'bg-indigo-600/80 text-white' : 'bg-slate-700/80 text-slate-200'}`}>
                        {m.senderId !== user.id && m.senderName && (
                          <p className="text-xs text-slate-400 mb-0.5">{m.senderName}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <form
                className="p-3 border-t border-slate-700/50 flex gap-2"
                onSubmit={(e) => { e.preventDefault(); sendMessage() }}
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg px-4 py-2 bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 max-w-sm mx-auto">
              <p className="text-slate-500 text-sm mb-2">No chat selected</p>
              <p className="text-slate-400 text-xs mb-4">
                Use <strong className="text-slate-300">Message friend</strong> to start a 1:1 chat, or <strong className="text-slate-300">New group</strong> to add several friends. You can also invite friends to events from the calendar via the share button on any event.
              </p>
              <Link href="/calendar" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
                Go to calendar →
              </Link>
            </div>
          )}
        </main>
      </div>

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowNewChat(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">
                {newChatMode === 'dm' ? 'Message a friend' : 'New group chat'}
              </h2>
              {newChatMode === 'dm' && (
                <p className="text-slate-400 text-xs mt-0.5">Choose a friend to start or open a direct chat.</p>
              )}
              {newChatMode === 'group' && (
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name (optional)"
                  className="mt-2 w-full rounded-lg px-3 py-2 bg-slate-900 border border-slate-600 text-slate-200 placeholder-slate-500 text-sm"
                />
              )}
            </div>
            <div className="p-2 overflow-y-auto max-h-60 flex-1 min-h-0">
              {newChatMode === 'group' && (
                <p className="text-slate-400 text-xs px-2 mb-2">Select friends to add to the group</p>
              )}
              {friendsLoading ? (
                <p className="text-slate-500 text-sm p-4">Loading friends...</p>
              ) : friends.length === 0 ? (
                <p className="text-slate-500 text-sm p-4">
                  No friends yet. <Link href="/profile" className="text-indigo-400 hover:underline">Add friends from your profile</Link> first.
                </p>
              ) : newChatMode === 'dm' ? (
                <ul className="space-y-0.5">
                  {friends.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => startDmWith(f)}
                        disabled={creating}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50 text-left disabled:opacity-50"
                      >
                        <span className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-slate-200 font-medium flex-shrink-0">
                          {(f.displayName || f.username || '?')[0].toUpperCase()}
                        </span>
                        <span className="text-slate-200">{f.displayName || f.username || 'Unknown'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                friends.map((f) => (
                  <label key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 cursor-pointer">
                    <input type="checkbox" checked={selectedFriendIds.has(f.id)} onChange={() => toggleFriend(f.id)} className="rounded border-slate-600 text-indigo-600" />
                    <span className="text-slate-200">{f.displayName || f.username || 'Unknown'}</span>
                  </label>
                ))
              )}
            </div>
            {newChatMode === 'group' && (
              <div className="p-4 border-t border-slate-700 flex gap-2">
                <button type="button" onClick={() => setShowNewChat(false)} className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700">Cancel</button>
                <button type="button" onClick={createGroup} disabled={selectedFriendIds.size === 0 || creating} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            )}
            {newChatMode === 'dm' && (
              <div className="p-4 border-t border-slate-700">
                <button type="button" onClick={() => setShowNewChat(false)} className="w-full py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
