'use client'

import { useState } from 'react'
import { getProfileShareUrl, supportsShare, copyToClipboard } from '@/lib/shareUtils'

interface ShareProfileButtonProps {
  userId: string
  displayName?: string | null
  variant?: 'button' | 'icon'
  className?: string
}

export default function ShareProfileButton({
  userId,
  displayName,
  variant = 'button',
  className = '',
}: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleShare = async () => {
    setLoading(true)
    const url = getProfileShareUrl(userId)
    const title = displayName ? `${displayName}'s profile` : 'Profile'

    try {
      if (supportsShare()) {
        await navigator.share({
          title,
          url,
          text: title,
        })
      } else {
        const ok = await copyToClipboard(url)
        if (ok) {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const ok = await copyToClipboard(url)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleShare}
        disabled={loading}
        className={`p-2 rounded-lg border border-slate-600/50 text-slate-400 hover:bg-slate-700/80 hover:text-white transition-colors ${className}`}
        title="Share profile"
        aria-label="Share profile"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors text-sm font-medium ${className}`}
      title="Share profile link"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      {loading ? '...' : copied ? 'Copied!' : 'Share profile'}
    </button>
  )
}
