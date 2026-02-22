'use client'

import { useState, useEffect, useRef } from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import Link from 'next/link'

interface EventShareButtonProps {
  eventId: string
  eventTitle: string
  eventUrl?: string
  className?: string
}

interface Friend {
  id: string
  displayName?: string | null
  username?: string | null
  avatarUrl?: string | null
}

export default function EventShareButton({ eventId, eventTitle, eventUrl, className = '' }: EventShareButtonProps) {
  const auth = useSupabaseAuth()
  const user = auth?.user
  const [open, setOpen] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const shareUrl = eventUrl ?? (typeof window !== 'undefined' ? `${window.location.origin}/calendar?event=${encodeURIComponent(eventId)}` : '')
  const whatsappUrl = shareUrl ? `https://wa.me/?text=${encodeURIComponent(`${eventTitle}\n${shareUrl}`)}` : '#'

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (!sendModalOpen || !user) return
    setLoadingFriends(true)
    setFriends([])
    setSent(null)
    fetch(`/api/users/${user.id}/friends`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setFriends(Array.isArray(data.friends) ? data.friends : []))
      .catch(() => setFriends([]))
      .finally(() => setLoadingFriends(false))
  }, [sendModalOpen, user])

  const handleSendToFriend = async (recipientId: string) => {
    if (!user) return
    setSendingTo(recipientId)
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ recipientId }),
      })
      if (res.ok) setSent(recipientId)
    } finally {
      setSendingTo(null)
    }
  }

  const btnClass = 'p-2 rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center ' + className

  return (
    <div className="relative inline-block" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnClass}
        title="Share event"
        aria-label="Share event"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 py-2 rounded-lg bg-slate-800 border border-slate-600/50 shadow-xl z-50 min-w-[200px]">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/80"
            onClick={() => setOpen(false)}
          >
            <span className="text-green-400">WhatsApp</span>
            <span>Share via WhatsApp</span>
          </a>
          {user ? (
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/80 text-left"
              onClick={() => { setOpen(false); setSendModalOpen(true) }}
            >
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Send to friend (in-app)
            </button>
          ) : null}
        </div>
      )}

      {sendModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setSendModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-w-sm w-full max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-white">Send event to a friend</h3>
              <button type="button" onClick={() => setSendModalOpen(false)} className="p-1 rounded text-slate-400 hover:text-white">×</button>
            </div>
            <div className="p-2 overflow-y-auto max-h-[50vh]">
              {loadingFriends ? (
                <p className="text-slate-500 text-sm p-4">Loading friends...</p>
              ) : friends.length === 0 ? (
                <p className="text-slate-500 text-sm p-4">No friends yet. Add friends from your profile.</p>
              ) : (
                <ul className="space-y-1">
                  {friends.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => handleSendToFriend(f.id)}
                        disabled={sendingTo !== null}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/80 text-left disabled:opacity-50"
                      >
                        <span className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-slate-200 font-medium flex-shrink-0">
                          {(f.displayName || f.username || '?')[0].toUpperCase()}
                        </span>
                        <span className="text-slate-200 truncate">{f.displayName || f.username || 'Unknown'}</span>
                        {sent === f.id && <span className="text-green-400 text-sm ml-auto">Sent</span>}
                        {sendingTo === f.id && <span className="text-slate-400 text-sm ml-auto">Sending...</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
