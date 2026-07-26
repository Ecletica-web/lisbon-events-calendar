'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

type CaptureState = 'idle' | 'capturing' | 'ready' | 'failed'

export default function FeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [captureState, setCaptureState] = useState<CaptureState>('idle')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const reset = useCallback(() => {
    setDescription('')
    setBlob(null)
    setCaptureState('idle')
    setError(null)
    setDone(false)
    setSending(false)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    reset()
  }, [reset])

  const captureScreenshot = useCallback(async () => {
    setCaptureState('capturing')
    setError(null)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
        ignoreElements: (el) => {
          if (!(el instanceof HTMLElement)) return false
          return el.dataset.feedbackIgnore === 'true'
        },
      })
      const shot: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.72)
      )
      if (!shot) throw new Error('Could not capture screenshot')
      setBlob(shot)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(shot)
      })
      setCaptureState('ready')
    } catch (e) {
      console.warn('Feedback screenshot failed', e)
      setCaptureState('failed')
      setBlob(null)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  const openModal = useCallback(() => {
    setOpen(true)
    setDone(false)
    setError(null)
    void captureScreenshot()
  }, [captureScreenshot])

  const submit = useCallback(async () => {
    const text = description.trim()
    if (text.length < 3) {
      setError('Please describe the issue (at least a few characters).')
      return
    }
    setSending(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('description', text)
      form.set('pageUrl', typeof window !== 'undefined' ? window.location.href : '')
      form.set('userAgent', typeof navigator !== 'undefined' ? navigator.userAgent : '')
      form.set(
        'viewport',
        typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : ''
      )
      if (blob) form.set('screenshot', blob, 'screenshot.jpg')

      const headers: Record<string, string> = {}
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/feedback', { method: 'POST', body: form, headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Send failed')
      setDone(true)
      setTimeout(() => close(), 1400)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }, [blob, close, description])

  if (!mounted) return null
  if (pathname?.startsWith('/admin')) return null

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        data-feedback-ignore="true"
        className="fixed z-[99990] pager-btn pager-btn-primary text-[10px] uppercase tracking-wider px-3 py-2.5 min-h-[44px] min-w-[44px] right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-5 shadow-[3px_3px_0_var(--pager-border-strong)]"
        aria-label="Send feedback"
      >
        Feedback
      </button>

      {open &&
        createPortal(
          <div
            data-feedback-ignore="true"
            className="fixed inset-0 z-[99998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div
              className="pager-panel w-full max-w-md max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 id="feedback-title" className="text-sm font-semibold text-pager-fg leading-relaxed">
                    Report an issue
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    className="pager-btn pager-btn-ghost text-xs px-2 py-1 min-h-[36px]"
                    aria-label="Close"
                  >
                    Close
                  </button>
                </div>

                <p className="text-xs text-pager-fg-muted">
                  A screenshot of what you see is attached when possible. Add a short note — that&apos;s enough.
                </p>

                <div className="border-2 border-pager-border bg-pager-bg-muted overflow-hidden min-h-[120px] flex items-center justify-center">
                  {captureState === 'capturing' && (
                    <span className="text-xs text-pager-fg-faint px-3 py-8">Capturing screen…</span>
                  )}
                  {captureState === 'failed' && (
                    <span className="text-xs text-pager-fg-faint px-3 py-8 text-center">
                      Screenshot unavailable — your note will still be sent.
                    </span>
                  )}
                  {previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Page screenshot preview" className="w-full h-auto max-h-48 object-contain object-top" />
                  )}
                </div>

                <div>
                  <label htmlFor="feedback-desc" className="block text-xs uppercase tracking-wider text-pager-fg-muted mb-1">
                    What&apos;s wrong?
                  </label>
                  <textarea
                    id="feedback-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="e.g. Calendar filters freeze when I pick a venue on iPhone"
                    className="pager-input resize-y min-h-[96px]"
                    autoFocus
                  />
                </div>

                {error && <p className="text-xs text-pager-fg">{error}</p>}
                {done && <p className="text-xs text-pager-fg">Thanks — sent.</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={sending || done || description.trim().length < 3}
                    onClick={() => void submit()}
                    className="pager-btn pager-btn-primary flex-1 px-4 py-2.5 text-xs uppercase tracking-wider disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : done ? 'Sent' : 'Send'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void captureScreenshot()}
                    disabled={captureState === 'capturing' || sending}
                    className="pager-btn pager-btn-ghost px-3 py-2.5 text-xs uppercase tracking-wider disabled:opacity-50"
                  >
                    Retake
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
