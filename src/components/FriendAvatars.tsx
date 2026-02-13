'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'

interface Friend {
  id: string
  displayName?: string
  avatarUrl?: string
  username?: string
}

interface FriendAvatarsProps {
  eventId: string
  maxDisplay?: number
  className?: string
}

export default function FriendAvatars({ eventId, maxDisplay = 3, className = '' }: FriendAvatarsProps) {
  const auth = useSupabaseAuth()
  const userId = auth?.user?.id
  const isConfigured = auth?.isConfigured ?? false
  const [users, setUsers] = useState<Friend[]>([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (!eventId || !userId || !isConfigured) {
      setUsers([])
      return
    }
    fetch(`/api/events/${encodeURIComponent(eventId)}/going-friends?viewerId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]))
  }, [eventId, userId, isConfigured])

  if (users.length === 0) return null

  const display = users.slice(0, maxDisplay)
  const extra = users.length - maxDisplay

  return (
    <>
      <div
        className={`flex items-center gap-1 ${className}`}
        onClick={(e) => {
          e.stopPropagation()
          if (users.length > 0) setShowModal(true)
        }}
      >
        <div className="flex -space-x-2">
          {display.map((u) => (
            <Link
              key={u.id}
              href={`/u/${u.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block w-6 h-6 rounded-full border-2 border-slate-800 overflow-hidden flex-shrink-0 hover:z-10 hover:ring-2 hover:ring-indigo-500"
              title={u.displayName || u.username || 'Friend'}
            >
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {(u.displayName || u.username || '?')[0].toUpperCase()}
                </div>
              )}
            </Link>
          ))}
        </div>
        {extra > 0 && (
          <span className="text-xs text-slate-400 ml-1">+{extra}</span>
        )}
      </div>
      {showModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-xl p-4 max-w-sm w-full max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Friends going</h3>
            <div className="space-y-2">
              {users.map((u) => (
                <Link
                  key={u.id}
                  href={`/u/${u.id}`}
                  onClick={() => setShowModal(false)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/60"
                >
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                      {(u.displayName || u.username || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-slate-200 font-medium">
                    {u.displayName || u.username || 'Unknown'}
                  </span>
                </Link>
              ))}
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="mt-3 w-full py-2 text-sm text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
