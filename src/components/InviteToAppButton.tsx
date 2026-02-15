'use client'

import { useState } from 'react'
import {
  getFullInviteText,
  getFullProfileInviteText,
  getProfileShareUrl,
  supportsShare,
  copyToClipboard,
  getAppUrl,
} from '@/lib/shareUtils'

interface InviteToAppButtonProps {
  variant?: 'button' | 'link'
  className?: string
  onAfterClick?: () => void
  /** When set, invite uses "Invite friends to your calendar" and shares this user's profile URL */
  profileUserId?: string
}

export default function InviteToAppButton({
  variant = 'button',
  className = '',
  onAfterClick,
  profileUserId,
}: InviteToAppButtonProps) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    onAfterClick?.()
    setLoading(true)
    const url = profileUserId ? getProfileShareUrl(profileUserId) : getAppUrl()
    const text = profileUserId ? getFullProfileInviteText(url) : getFullInviteText()

    try {
      if (supportsShare()) {
        await navigator.share({
          title: 'Lisbon Events Calendar',
          text: profileUserId ? getFullProfileInviteText(url) : getFullInviteText(),
          url,
        })
      } else {
        const ok = await copyToClipboard(text)
        if (ok) {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const ok = await copyToClipboard(text)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } finally {
      setLoading(false)
    }
  }

  const linkLabel = profileUserId ? 'Invite friends to your calendar' : 'Invite friends to the calendar'

  if (variant === 'link') {
    return (
      <button
        onClick={handleInvite}
        disabled={loading}
        className={`text-sm text-indigo-400 hover:text-indigo-300 transition-colors ${className}`}
      >
        {loading ? '...' : copied ? 'Copied!' : linkLabel}
      </button>
    )
  }

  return (
    <button
      onClick={handleInvite}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors text-sm ${className}`}
      title="Share the calendar with friends"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      {loading ? '...' : copied ? 'Copied!' : profileUserId ? 'Invite to your calendar' : 'Invite to calendar'}
    </button>
  )
}
