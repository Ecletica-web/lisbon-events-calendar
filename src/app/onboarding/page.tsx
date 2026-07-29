'use client'

import { useEffect, useRef, useState, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ONBOARDING_TAG_GROUPS } from '@/data/onboardingTagGroups'
import { PREDEFINED_PERSONAS } from '@/data/predefinedPersonas'
import {
  buildCalendarUrl,
  clearOnboardingFromStorage,
  getRandomSkipCategory,
  loadOnboardingFromStorage,
  type OnboardingPrefs,
} from '@/lib/onboarding'
import { playTypingBeep, unlockTypingAudio } from '@/lib/typingBeep'
import { supabase } from '@/lib/supabase/client'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'

const DEFAULT_PREFS: OnboardingPrefs = {
  tags: [],
  freeOnly: false,
  englishFriendly: false,
  accessible: false,
  avoidSoldOut: false,
  nearMe: false,
}

const TOTAL_STEPS = 4

/** Map internal step index → user-facing STEP n/N (intro = 0, hidden). */
function displayStep(step: number): number | null {
  if (step <= 0) return null
  if (step === 1) return 1
  if (step === 2) return 2
  if (step === 4) return 3
  if (step === 5) return 4
  return null
}

const INTRO_PHASES: { text: string; holdMs: number; isFinal?: boolean }[] = [
  { text: 'Hey', holdMs: 500 },
  { text: 'Welcome to Terminus.', holdMs: 700 },
  { text: "We're happy you're here!", holdMs: 700 },
  { text: 'We collect a lot of Lisbon events.', holdMs: 700 },
  { text: 'Like...', holdMs: 500 },
  { text: 'A LOT', holdMs: 600 },
  { text: "Maybe we've missed your family lunch…", holdMs: 800 },
  { text: "but we've got most of the rest.", holdMs: 800 },
  { text: 'Let us know what you like so we can pick what suits you.', holdMs: 1200, isFinal: true },
]

const CHAR_MS = 42

function IntroSequence({ onComplete }: { onComplete: () => void }) {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [lineDone, setLineDone] = useState(false)
  const advancingRef = useRef(false)
  const phase = INTRO_PHASES[phaseIndex]
  const fullText = phase?.text ?? ''
  const shown = fullText.slice(0, charCount)
  const typing = Boolean(phase) && charCount < fullText.length

  useEffect(() => {
    void unlockTypingAudio()
  }, [])

  const advance = useCallback(() => {
    if (advancingRef.current || !phase) return
    advancingRef.current = true
    if (phase.isFinal) {
      onComplete()
      return
    }
    setTimeout(() => {
      setPhaseIndex((i) => i + 1)
      setCharCount(0)
      setLineDone(false)
      advancingRef.current = false
    }, 180)
  }, [phase, onComplete])

  // Type one character at a time + Pokemon-style blip
  useEffect(() => {
    if (!phase || lineDone) return
    if (charCount >= fullText.length) {
      setLineDone(true)
      return
    }
    const t = setTimeout(() => {
      const next = charCount + 1
      const ch = fullText[charCount]
      if (ch && ch !== ' ') {
        // Slight pitch wobble so it feels less flat
        playTypingBeep({ pitch: 860 + (next % 3) * 40 })
      }
      setCharCount(next)
    }, CHAR_MS)
    return () => clearTimeout(t)
  }, [phase, phaseIndex, charCount, fullText, lineDone])

  // Hold after line completes, then advance
  useEffect(() => {
    if (!lineDone || !phase) return
    const t = setTimeout(() => advance(), phase.holdMs)
    return () => clearTimeout(t)
  }, [lineDone, phase, advance])

  const handleTap = async () => {
    await unlockTypingAudio()
    if (!phase) return
    if (typing) {
      setCharCount(fullText.length)
      setLineDone(true)
      return
    }
    advance()
  }

  if (!phase) return null

  return (
    <button
      type="button"
      onClick={() => void handleTap()}
      className="text-left px-4 sm:px-6 md:px-8 w-full min-h-[50vh] flex flex-col items-center justify-center bg-transparent border-0 cursor-pointer"
      aria-label="Advance intro dialogue"
    >
      <div className="terminus-panel w-full max-w-3xl mx-auto p-5 sm:p-8 min-h-[9rem] sm:min-h-[10rem]">
        <p className="font-pixel text-[10px] text-terminus-fg-muted mb-4 uppercase tracking-wider">
          &gt; terminus_boot
        </p>
        <p className="font-pixel text-sm sm:text-base md:text-lg text-terminus-fg leading-relaxed w-full">
          {shown}
          <span className="terminus-cursor" aria-hidden />
        </p>
        <p className="mt-6 text-[10px] uppercase tracking-wider text-terminus-fg-faint">
          {typing ? 'tap to skip line' : 'tap to continue'}
        </p>
      </div>
    </button>
  )
}

function StepHeader({ n, prompt }: { n: number; prompt: string }) {
  return (
    <div className="space-y-3 text-left w-full">
      <p className="font-pixel text-[10px] sm:text-xs text-terminus-fg-muted uppercase tracking-wider">
        STEP {n}/{TOTAL_STEPS}
      </p>
      <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-terminus-fg">
        <span className="text-terminus-fg-muted mr-2">&gt;</span>
        {prompt}
      </h2>
    </div>
  )
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEdit = searchParams.get('edit') === '1'
  const supabaseAuth = useSupabaseAuth()
  const supabaseUser = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const isLoggedIn = supabaseConfigured && !!supabaseUser

  const [step, setStep] = useState(isEdit ? 1 : 0)
  const [pickMode, setPickMode] = useState<'tags' | 'vibe' | null>(null)
  const [prefs, setPrefs] = useState<OnboardingPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      if (isLoggedIn) {
        try {
          const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
          if (session?.access_token) {
            const res = await fetch('/api/onboarding/status', {
              headers: { Authorization: `Bearer ${session.access_token}` },
            })
            const { preferences } = await res.json()
            if (preferences) {
              setPrefs({
                intent: preferences.intent,
                tags: preferences.tags ?? [],
                vibe: preferences.vibe,
                freeOnly: preferences.freeOnly ?? false,
                englishFriendly: preferences.englishFriendly ?? false,
                accessible: preferences.accessible ?? false,
                avoidSoldOut: preferences.avoidSoldOut ?? false,
                nearMe: preferences.nearMe ?? false,
                lat: preferences.lat,
                lng: preferences.lng,
              })
            }
          }
        } catch {
          // fallback to localStorage
        }
      }
      const stored = loadOnboardingFromStorage()
      if (stored && (!isLoggedIn || Object.keys(stored).length > 0)) {
        setPrefs((p) => ({ ...p, ...stored }))
      }
      setLoading(false)
    }
    load()
  }, [isLoggedIn])

  const updatePrefs = (updates: Partial<OnboardingPrefs>) => {
    setPrefs((p) => ({ ...p, ...updates }))
  }

  const toggleTag = (tag: string) => {
    setPrefs((p) => {
      const tags = p.tags.includes(tag) ? p.tags.filter((t) => t !== tag) : [...p.tags, tag]
      return { ...p, tags }
    })
  }

  const handleSkip = () => {
    const randomCategory = getRandomSkipCategory()
    const skipPrefs: OnboardingPrefs = {
      ...prefs,
      tags: [],
      selectedCategories: [randomCategory],
    }
    clearOnboardingFromStorage()
    const url = buildCalendarUrl(skipPrefs)
    const separator = url.includes('?') ? '&' : '?'
    const finalUrl = isLoggedIn ? url : `${url}${separator}fromOnboarding=1`
    router.push(finalUrl)
  }

  const handleEnterCalendar = async () => {
    setSubmitting(true)
    clearOnboardingFromStorage()

    if (isLoggedIn) {
      try {
        const { data: { session } } = await (supabase?.auth.getSession() ?? { data: { session: null } })
        if (session?.access_token) {
          await fetch('/api/profile', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              onboarding_complete: true,
              onboarding_intent: prefs.intent || null,
              onboarding_tags: prefs.tags,
              onboarding_vibe: prefs.vibe || null,
              onboarding_free_only: prefs.freeOnly,
              onboarding_english_friendly: prefs.englishFriendly,
              onboarding_accessible: prefs.accessible,
              onboarding_avoid_sold_out: prefs.avoidSoldOut,
              onboarding_near_me: prefs.nearMe,
              onboarding_lat: prefs.lat ?? null,
              onboarding_lng: prefs.lng ?? null,
            }),
          })
        }
      } catch {
        // continue to redirect
      }
    }

    const url = buildCalendarUrl(prefs)
    const separator = url.includes('?') ? '&' : '?'
    const finalUrl = isLoggedIn ? url : `${url}${separator}fromOnboarding=1`
    router.push(finalUrl)
  }

  const stepN = displayStep(step)

  if (loading) {
    return (
      <div className="min-h-screen bg-terminus-bg flex items-center justify-center pt-24">
        <div className="font-pixel text-[10px] text-terminus-fg-muted">&gt; loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-terminus-bg text-terminus-fg flex flex-col items-center justify-center px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      {step >= 0 && (
        <button
          onClick={handleSkip}
          className="terminus-btn terminus-btn-ghost fixed right-4 sm:right-6 z-[100000] text-xs sm:text-sm touch-manipulation px-3 py-2"
          style={{ top: 'calc(5rem + env(safe-area-inset-top))' }}
        >
          Skip
        </button>
      )}
      <div className={`mx-auto w-full flex flex-col items-center justify-center min-h-[60vh] sm:min-h-[70vh] py-8 sm:py-12 md:py-16 ${step === 0 ? 'max-w-full px-4 sm:px-8' : 'max-w-2xl px-4'}`}>
        {step === 0 && (
          <IntroSequence onComplete={() => setTimeout(() => setStep(1), 600)} />
        )}

        {step === 1 && stepN && (
          <div className="space-y-8 sm:space-y-10 w-full max-w-md px-4">
            <StepHeader n={stepN} prompt="What brings you here?" />
            <div className="grid gap-2 sm:gap-3">
              {[
                { id: 'now', label: 'I want to do something right now!' },
                { id: 'plan', label: 'Planning.' },
                { id: 'all', label: 'I want all of the events. (WATCH OUT)' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => {
                    updatePrefs({ intent: id })
                    if (id === 'all') {
                      clearOnboardingFromStorage()
                      const url = isLoggedIn ? '/calendar' : '/calendar?fromOnboarding=1'
                      router.push(url)
                      return
                    }
                    if (id === 'now') {
                      clearOnboardingFromStorage()
                      const base = '/calendar?now=1'
                      const url = isLoggedIn ? base : `${base}&fromOnboarding=1`
                      router.push(url)
                      return
                    }
                    setStep(2)
                  }}
                  className={`terminus-btn w-full text-center p-4 min-h-[52px] sm:min-h-[56px] text-sm sm:text-base touch-manipulation ${
                    prefs.intent === id
                      ? 'terminus-btn-primary'
                      : id === 'all'
                        ? 'italic text-terminus-fg-muted'
                        : ''
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && !pickMode && stepN && (
          <div className="space-y-8 w-full max-w-md px-4">
            <StepHeader n={stepN} prompt="How do you want to customize?" />
            <div className="grid gap-3">
              <button
                onClick={() => { setPickMode('tags'); setStep(2) }}
                className="terminus-btn w-full text-center p-4 min-h-[52px] touch-manipulation text-sm sm:text-base"
              >
                Pick tags that interest me
              </button>
              <button
                onClick={() => { setPickMode('vibe'); setStep(2) }}
                className="terminus-btn w-full text-center p-4 min-h-[52px] touch-manipulation text-sm sm:text-base"
              >
                Pick a vibe instead
              </button>
            </div>
          </div>
        )}

        {step === 2 && pickMode === 'tags' && stepN && (
          <div className="space-y-6 sm:space-y-8 w-full max-w-lg px-4 sm:px-0">
            <StepHeader n={stepN} prompt="What interests you?" />
            <p className="text-terminus-fg-muted text-sm sm:text-base text-left">
              <span className="text-terminus-fg-faint mr-1">&gt;</span>
              Pick a few tags
            </p>
            <div className="terminus-panel p-4 space-y-5 sm:space-y-6 text-left max-h-[60vh] overflow-y-auto overscroll-contain">
              {ONBOARDING_TAG_GROUPS.map((group) => (
                <div key={group.id}>
                  <h3 className="font-pixel text-[9px] sm:text-[10px] text-terminus-fg-muted mb-2 uppercase tracking-wider">
                    {group.label}
                  </h3>
                  <div className="flex flex-wrap gap-2 justify-start">
                    {group.tags.map((tag) => {
                      const selected = prefs.tags.includes(tag)
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`terminus-pill min-h-[36px] px-3 py-1.5 text-xs sm:text-sm lowercase touch-manipulation ${
                            selected ? 'terminus-pill-active bg-terminus-accent text-terminus-accent-fg' : ''
                          }`}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-start pt-2 flex-wrap">
              <button
                onClick={() => { setPickMode(null); setStep(2) }}
                className="terminus-btn terminus-btn-ghost px-5 py-2.5 min-h-[44px] touch-manipulation text-sm"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="terminus-btn terminus-btn-primary px-6 py-2.5 min-h-[44px] touch-manipulation text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && pickMode === 'vibe' && stepN && (
          <div className="space-y-6 sm:space-y-8 w-full max-w-lg px-4 sm:px-0">
            <StepHeader n={stepN} prompt="Pick a vibe" />
            <p className="text-terminus-fg-muted text-sm sm:text-base text-left">
              <span className="text-terminus-fg-faint mr-1">&gt;</span>
              We&apos;ll filter events to match
            </p>
            <div className="grid gap-2 sm:gap-3 text-left max-h-[55vh] overflow-y-auto overscroll-contain">
              {PREDEFINED_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    updatePrefs({
                      vibe: p.slug,
                      tags: [...new Set([...p.tags])],
                    })
                    setStep(4)
                  }}
                  className={`terminus-panel text-left p-4 min-h-[80px] touch-manipulation text-sm sm:text-base transition-colors ${
                    prefs.vibe === p.slug
                      ? 'bg-terminus-accent text-terminus-accent-fg'
                      : 'hover:bg-terminus-muted'
                  }`}
                >
                  <span className="text-2xl mr-2">{p.emoji}</span>
                  <span className="font-medium">{p.name}</span>
                  <p className={`mt-1 text-sm ${prefs.vibe === p.slug ? 'opacity-80' : 'text-terminus-fg-muted'}`}>
                    {p.description}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-start pt-2 flex-wrap">
              <button
                onClick={() => { setPickMode(null); setStep(2) }}
                className="terminus-btn terminus-btn-ghost px-5 py-2.5 min-h-[44px] touch-manipulation text-sm"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === 4 && stepN && (
          <div className="space-y-6 sm:space-y-8 w-full max-w-md px-4 sm:px-0">
            <StepHeader n={stepN} prompt="Any preferences?" />
            <div className="space-y-2 text-left">
              {[
                { key: 'freeOnly', label: 'Free events only' },
                { key: 'englishFriendly', label: 'English-friendly events' },
                { key: 'accessible', label: 'LGBTQIA-friendly' },
                { key: 'avoidSoldOut', label: 'Avoid sold-out events' },
                { key: 'nearMe', label: 'Events near me' },
              ].map(({ key, label }) => {
                const checked = prefs[key as keyof OnboardingPrefs] as boolean
                return (
                  <label
                    key={key}
                    className={`terminus-panel flex items-center gap-3 cursor-pointer p-4 min-h-[52px] touch-manipulation ${
                      checked ? 'bg-terminus-accent text-terminus-accent-fg' : 'hover:bg-terminus-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        updatePrefs({ [key]: e.target.checked } as Partial<OnboardingPrefs>)
                      }
                      className="rounded-none border-2 border-terminus-border w-5 h-5 min-w-[20px] min-h-[20px] accent-terminus-fg"
                    />
                    <span className="text-sm sm:text-base">
                      <span className="opacity-60 mr-1">&gt;</span>
                      {label}
                    </span>
                  </label>
                )
              })}
            </div>
            <div className="flex gap-3 justify-start pt-2 flex-wrap">
              <button
                onClick={() => setStep(2)}
                className="terminus-btn terminus-btn-ghost px-5 py-2.5 min-h-[44px] touch-manipulation text-sm"
              >
                Back
              </button>
              <button
                onClick={() => setStep(5)}
                className="terminus-btn terminus-btn-primary px-6 py-2.5 min-h-[44px] touch-manipulation text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && stepN && (
          <div className="space-y-8 sm:space-y-10 w-full max-w-md px-4">
            <StepHeader n={stepN} prompt="You're all set" />
            <p className="text-terminus-fg-muted text-sm sm:text-base text-left">
              <span className="text-terminus-fg-faint mr-1">&gt;</span>
              Your calendar, tailored to you.
            </p>
            <button
              onClick={handleEnterCalendar}
              disabled={submitting}
              className="terminus-btn terminus-btn-primary px-8 py-3 min-h-[52px] font-pixel text-[10px] sm:text-xs disabled:opacity-70 touch-manipulation"
            >
              {submitting ? 'Loading...' : 'Enter calendar'}
            </button>
            <p className="text-sm text-terminus-fg-faint text-left">
              <Link href="/calendar" className="terminus-link italic">
                Or see all events
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-terminus-bg flex items-center justify-center pt-24">
        <div className="font-pixel text-[10px] text-terminus-fg-muted">&gt; loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
