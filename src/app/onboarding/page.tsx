'use client'

import { useEffect, useState, Suspense } from 'react'
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

const INTRO_PHASES: { text: string; displayMs: number; isFinal?: boolean }[] = [
  { text: 'Hey', displayMs: 1000 },
  { text: 'Welcome to Lisbon Events Calendar.', displayMs: 1500 },
  { text: "We're happy you're here!", displayMs: 1200 },
  { text: 'We collect a lot of Lisbon events.', displayMs: 1500 },
  { text: 'Like...', displayMs: 1200 },
  { text: 'A LOT', displayMs: 1000 },
  { text: "Maybe we've missed your family lunch…", displayMs: 1500 },
  { text: "but we've got most of the rest.", displayMs: 1500 },
  { text: 'Let us know what you like so we can pick what suits you.', displayMs: 2500, isFinal: true },
]

function IntroSequence({ onComplete }: { onComplete: () => void }) {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const phase = INTRO_PHASES[phaseIndex]
  const isFinal = phase?.isFinal

  useEffect(() => {
    if (!phase) return
    const showTimer = setTimeout(() => {
      if (isFinal) {
        onComplete()
        return
      }
      setVisible(false)
    }, phase.displayMs)
    return () => clearTimeout(showTimer)
  }, [phaseIndex, phase?.displayMs, isFinal, onComplete])

  useEffect(() => {
    if (!visible && !isFinal) {
      const hideTimer = setTimeout(() => {
        setPhaseIndex((i) => i + 1)
        setVisible(true)
      }, 300)
      return () => clearTimeout(hideTimer)
    }
  }, [visible, isFinal])

  if (!phase) return null

  return (
    <div className="text-center px-4 sm:px-6 md:px-8 w-full min-h-[50vh] flex flex-col items-center justify-center">
      <p
        className={`text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-relaxed transition-opacity duration-300 w-full max-w-4xl mx-auto ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {phase.text}
      </p>
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center pt-24">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col items-center justify-center px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      {step >= 0 && (
        <button
          onClick={handleSkip}
          className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[100000] text-base sm:text-lg text-slate-400 hover:text-white transition-colors touch-manipulation px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        >
          Skip
        </button>
      )}
      <div className={`mx-auto w-full flex flex-col items-center justify-center min-h-[60vh] sm:min-h-[70vh] py-8 sm:py-12 md:py-16 ${step === 0 ? 'max-w-full px-4 sm:px-8' : 'max-w-2xl px-4'}`}>
        {step === 0 && (
          <IntroSequence onComplete={() => setTimeout(() => setStep(1), 600)} />
        )}

        {step === 1 && (
          <div className="space-y-8 sm:space-y-10 text-center w-full max-w-md px-4">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">What brings you here?</h2>
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
                  className={`w-full text-center p-4 min-h-[52px] sm:min-h-[56px] flex items-center justify-center rounded-xl border transition-all touch-manipulation text-base sm:text-lg ${
                    prefs.intent === id
                      ? 'border-indigo-500 bg-indigo-500/20 text-white'
                      : id === 'all'
                        ? 'border-amber-600/60 bg-slate-800/40 text-amber-200/90 hover:border-amber-500 hover:text-amber-100 italic'
                        : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && !pickMode && (
          <div className="space-y-8 text-center w-full max-w-md px-4">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">How do you want to customize?</h2>
            <div className="grid gap-3">
              <button
                onClick={() => { setPickMode('tags'); setStep(2) }}
                className="w-full text-center p-4 min-h-[52px] rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-600 touch-manipulation text-base sm:text-lg"
              >
                Pick tags that interest me
              </button>
              <button
                onClick={() => { setPickMode('vibe'); setStep(2) }}
                className="w-full text-center p-4 min-h-[52px] rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-600 touch-manipulation text-base sm:text-lg"
              >
                Pick a vibe instead
              </button>
            </div>
          </div>
        )}

        {step === 2 && pickMode === 'tags' && (
          <div className="space-y-6 sm:space-y-8 text-center w-full max-w-lg px-4 sm:px-0">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">What interests you?</h2>
            <p className="text-slate-400 text-base sm:text-lg">Pick a few tags</p>
            <div className="space-y-5 sm:space-y-6 text-left max-h-[60vh] overflow-y-auto overscroll-contain pr-1 -mr-1">
              {ONBOARDING_TAG_GROUPS.map((group) => (
                <div key={group.id}>
                  <h3 className="text-base sm:text-lg font-medium text-slate-400 mb-2">{group.label}</h3>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    {group.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-2 min-h-[44px] rounded-lg text-base sm:text-lg transition-all touch-manipulation ${
                          prefs.tags.includes(tag)
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-center pt-4 flex-wrap">
              <button
                onClick={() => { setPickMode(null); setStep(2) }}
                className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-400 hover:text-white touch-manipulation text-base"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="px-6 py-2.5 min-h-[44px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 touch-manipulation text-base"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && pickMode === 'vibe' && (
          <div className="space-y-6 sm:space-y-8 text-center w-full max-w-lg px-4 sm:px-0">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Pick a vibe</h2>
            <p className="text-slate-400 text-base sm:text-lg">We&apos;ll filter events to match</p>
            <div className="grid gap-3 sm:gap-4 text-left max-h-[55vh] overflow-y-auto overscroll-contain pr-1 -mr-1">
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
                  className={`text-left p-4 min-h-[80px] rounded-xl border transition-all touch-manipulation text-base sm:text-lg ${
                    prefs.vibe === p.slug
                      ? 'border-indigo-500 bg-indigo-500/20'
                      : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
                  }`}
                >
                  <span className="text-3xl mr-2">{p.emoji}</span>
                  <span className="font-medium text-white">{p.name}</span>
                  <p className="text-slate-400 mt-1">{p.description}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-center pt-4 flex-wrap">
              <button
                onClick={() => { setPickMode(null); setStep(2) }}
                className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-400 hover:text-white touch-manipulation text-base"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 sm:space-y-8 text-center w-full max-w-md px-4 sm:px-0">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Any preferences?</h2>
            <div className="space-y-4 text-left max-w-sm mx-auto">
              {[
                { key: 'freeOnly', label: 'Free events only' },
                { key: 'englishFriendly', label: 'English-friendly events' },
                { key: 'accessible', label: 'Accessible venues' },
                { key: 'avoidSoldOut', label: 'Avoid sold-out events' },
                { key: 'nearMe', label: 'Events near me' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 cursor-pointer p-4 min-h-[52px] rounded-xl bg-slate-800/60 border border-slate-700 hover:border-slate-600 touch-manipulation"
                >
                  <input
                    type="checkbox"
                    checked={prefs[key as keyof OnboardingPrefs] as boolean}
                    onChange={(e) =>
                      updatePrefs({ [key]: e.target.checked } as Partial<OnboardingPrefs>)
                    }
                    className="rounded border-slate-600 text-indigo-600 w-5 h-5 min-w-[20px] min-h-[20px]"
                  />
                  <span className="text-slate-200 text-base sm:text-lg">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 justify-center pt-4 flex-wrap">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-400 hover:text-white touch-manipulation text-base"
              >
                Back
              </button>
              <button
                onClick={() => setStep(5)}
                className="px-6 py-2.5 min-h-[44px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 touch-manipulation text-base"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-8 sm:space-y-10 text-center max-w-md px-4">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">You&apos;re all set</h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Your calendar, tailored to you.
            </p>
            <button
              onClick={handleEnterCalendar}
              disabled={submitting}
              className="px-8 py-3 min-h-[52px] rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-base sm:text-lg hover:opacity-90 disabled:opacity-70 touch-manipulation"
            >
              {submitting ? 'Loading...' : 'Enter calendar'}
            </button>
            <p className="text-base sm:text-lg text-slate-500">
              <Link href="/calendar" className="text-slate-400 hover:text-white italic">
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center pt-24">
        <div className="text-slate-400">Loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
