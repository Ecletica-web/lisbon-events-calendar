'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
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

function ChatPageContent() {
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
      <div className="min-h-screen bg-terminus-bg text-terminus-fg flex flex-col items-center justify-center p-6">
        <p className="font-pixel text-sm uppercase tracking-wider mb-2">{'> AUTH REQUIRED'}</p>
        <p className="text-terminus-fg-muted text-xs font-mono uppercase tracking-wider mb-4">Sign in to use chat</p>
        <Link href="/login" className="terminus-btn terminus-btn-primary text-xs uppercase tracking-wider">
          Log in
        </Link>
      </div>
    )
  }

  const selectedChat = chats.find((c) => c.id === selectedId)
  const selectedTitle = selectedChat
    ? chatTitle(selectedChat, user.id)
    : ''

  return (
    <div className="min-h-screen bg-terminus-bg text-terminus-fg flex flex-col pt-16 pb-8">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col md:flex-row gap-0 md:gap-4 px-2">
        <aside className="terminus-panel w-full md:w-72 flex-shrink-0 overflow-hidden flex flex-col max-h-[40vh] md:max-h-[calc(100vh-8rem)]">
          <div className="p-3 border-b-2 border-terminus-strong">
            <h1 className="font-pixel text-sm uppercase tracking-wider text-terminus-fg">{'> CHANNELS'}</h1>
            <p className="text-terminus-fg-muted text-[10px] font-mono uppercase tracking-wider mt-1">
              DM · group · share from calendar
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => openNewChat('dm')}
                className="terminus-btn terminus-btn-primary text-[10px] uppercase tracking-wider px-3 py-1.5"
              >
                Message friend
              </button>
              <button
                type="button"
                onClick={() => openNewChat('group')}
                className="terminus-btn terminus-btn-ghost text-[10px] uppercase tracking-wider px-3 py-1.5"
              >
                New group
              </button>
            </div>
          </div>
          <ul className="overflow-y-auto flex-1">
            {loading ? (
              <li className="p-4 text-terminus-fg-faint text-xs font-mono uppercase tracking-wider">{'> LOADING...'}</li>
            ) : chats.length === 0 ? (
              <li className="p-4 text-terminus-fg-faint text-xs font-mono uppercase tracking-wider">
                {'> NO CHANNELS — message a friend or create a group'}
              </li>
            ) : (
              chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(chat.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 rounded-none border-b border-terminus-border hover:bg-terminus-muted ${selectedId === chat.id ? 'bg-terminus-muted' : ''}`}
                  >
                    <span className="w-10 h-10 rounded-none border-2 border-terminus-strong bg-terminus-muted flex items-center justify-center text-terminus-fg font-pixel text-xs flex-shrink-0">
                      {chat.is_group ? '#' : (chatTitle(chat, user.id)[0] || '?').toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-terminus-fg font-mono text-sm truncate uppercase tracking-wide">
                        {chatTitle(chat, user.id)}
                      </span>
                      <span className="block text-[10px] font-mono uppercase tracking-wider text-terminus-fg-faint">
                        {chat.is_group ? 'GROUP' : 'DM'}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="terminus-panel flex-1 flex flex-col min-h-0 overflow-hidden mt-4 md:mt-0">
          {selectedId ? (
            <>
              <div className="p-3 border-b-2 border-terminus-strong">
                <p className="font-pixel text-xs uppercase tracking-wider text-terminus-fg">
                  {`> ${selectedTitle || 'CHANNEL'}`}
                </p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-terminus-fg-faint mt-0.5">
                  {selectedChat?.is_group ? 'GROUP CHANNEL' : 'DIRECT MESSAGE'}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-terminus-bg">
                {loadingMessages ? (
                  <p className="text-terminus-fg-faint text-xs font-mono uppercase tracking-wider">{'> LOADING MESSAGES...'}</p>
                ) : messages.length === 0 ? (
                  <p className="font-pixel text-sm uppercase tracking-wider text-terminus-fg-muted">{'> NO MESSAGES'}</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderId === user.id
                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-none px-3 py-2 ${
                            mine
                              ? 'bg-terminus-accent text-terminus-accent-fg'
                              : 'border-2 border-terminus-strong bg-terminus-muted text-terminus-fg'
                          }`}
                        >
                          {!mine && m.senderName && (
                            <p className="text-[10px] font-mono uppercase tracking-wider text-terminus-fg-muted mb-0.5">
                              {m.senderName}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words font-mono">{m.content}</p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              <form
                className="p-3 border-t-2 border-terminus-strong flex gap-2 bg-terminus-elevated"
                onSubmit={(e) => { e.preventDefault(); sendMessage() }}
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="> TYPE MESSAGE..."
                  className="terminus-input flex-1 text-sm font-mono uppercase tracking-wide placeholder:normal-case"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="terminus-btn terminus-btn-primary text-xs uppercase tracking-wider px-4 py-2 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 max-w-sm mx-auto">
              <p className="font-pixel text-sm uppercase tracking-wider text-terminus-fg mb-2">{'> SELECT CHANNEL'}</p>
              <p className="text-terminus-fg-muted text-[10px] font-mono uppercase tracking-wider mb-4 leading-relaxed">
                Message friend for 1:1 · New group for multi · Share events from calendar
              </p>
              <Link href="/calendar" className="terminus-link text-xs uppercase tracking-wider">
                ← Calendar
              </Link>
            </div>
          )}
        </main>
      </div>

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setShowNewChat(false)}>
          <div className="terminus-panel max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b-2 border-terminus-strong">
              <h2 className="font-pixel text-sm uppercase tracking-wider text-terminus-fg">
                {newChatMode === 'dm' ? '> MESSAGE FRIEND' : '> NEW GROUP'}
              </h2>
              {newChatMode === 'dm' && (
                <p className="text-terminus-fg-muted text-[10px] font-mono uppercase tracking-wider mt-1">
                  Choose a friend to open DM
                </p>
              )}
              {newChatMode === 'group' && (
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="GROUP NAME (OPTIONAL)"
                  className="terminus-input mt-2 w-full text-sm font-mono uppercase tracking-wide"
                />
              )}
            </div>
            <div className="p-2 overflow-y-auto max-h-60 flex-1 min-h-0">
              {newChatMode === 'group' && (
                <p className="text-terminus-fg-muted text-[10px] font-mono uppercase tracking-wider px-2 mb-2">
                  Select friends to add
                </p>
              )}
              {friendsLoading ? (
                <p className="text-terminus-fg-faint text-xs font-mono uppercase tracking-wider p-4">{'> LOADING FRIENDS...'}</p>
              ) : friends.length === 0 ? (
                <p className="text-terminus-fg-faint text-xs font-mono uppercase tracking-wider p-4">
                  {'> NO FRIENDS — '}
                  <Link href="/profile" className="terminus-link">add from profile</Link>
                </p>
              ) : newChatMode === 'dm' ? (
                <ul className="space-y-0.5">
                  {friends.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => startDmWith(f)}
                        disabled={creating}
                        className="w-full flex items-center gap-3 p-3 rounded-none hover:bg-terminus-muted text-left disabled:opacity-50"
                      >
                        <span className="w-10 h-10 rounded-none border-2 border-terminus-strong bg-terminus-muted flex items-center justify-center text-terminus-fg font-pixel text-xs flex-shrink-0">
                          {(f.displayName || f.username || '?')[0].toUpperCase()}
                        </span>
                        <span className="text-terminus-fg font-mono text-sm uppercase tracking-wide">
                          {f.displayName || f.username || 'Unknown'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                friends.map((f) => (
                  <label key={f.id} className="flex items-center gap-3 p-2 rounded-none hover:bg-terminus-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFriendIds.has(f.id)}
                      onChange={() => toggleFriend(f.id)}
                      className="rounded-none border-2 border-terminus-strong bg-terminus-bg text-terminus-accent accent-terminus-accent"
                    />
                    <span className="text-terminus-fg font-mono text-sm uppercase tracking-wide">
                      {f.displayName || f.username || 'Unknown'}
                    </span>
                  </label>
                ))
              )}
            </div>
            {newChatMode === 'group' && (
              <div className="p-4 border-t-2 border-terminus-strong flex gap-2">
                <button type="button" onClick={() => setShowNewChat(false)} className="terminus-btn terminus-btn-ghost flex-1 text-xs uppercase tracking-wider py-2">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createGroup}
                  disabled={selectedFriendIds.size === 0 || creating}
                  className="terminus-btn terminus-btn-primary flex-1 text-xs uppercase tracking-wider py-2 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            )}
            {newChatMode === 'dm' && (
              <div className="p-4 border-t-2 border-terminus-strong">
                <button type="button" onClick={() => setShowNewChat(false)} className="terminus-btn terminus-btn-ghost w-full text-xs uppercase tracking-wider py-2">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChatPageFallback() {
  return (
    <div className="min-h-screen bg-terminus-bg text-terminus-fg flex flex-col items-center justify-center p-6">
      <p className="font-pixel text-sm uppercase tracking-wider text-terminus-fg-muted">{'> LOADING CHAT...'}</p>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatPageFallback />}>
      <ChatPageContent />
    </Suspense>
  )
}
