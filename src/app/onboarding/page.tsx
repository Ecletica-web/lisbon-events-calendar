'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import TypewriterText from '@/components/TypewriterText'
import { ONBOARDING_TAG_GROUPS } from '@/data/onboardingTagGroups'
import { PREDEFINED_PERSONAS } from '@/data/predefinedPersonas'
import {
  buildCalendarUrl,
  clearOnboardingFromStorage,
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

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEdit = searchParams.get('edit') === '1'
  const supabaseAuth = useSupabaseAuth()
  const supabaseUser = supabaseAuth?.user
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const isLoggedIn = supabaseConfigured && !!supabaseUser

  const [step, setStep] = useState(isEdit ? 1 : 0)
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
      <div className="max-w-2xl mx-auto w-full flex flex-col items-center py-6 sm:py-12 md:py-16">
        {step === 0 && (
          <div className="text-center space-y-8 px-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white leading-relaxed">
              <TypewriterText
                text="Welcome to Lisbon Events."
                speed={90}
                onComplete={() => setTimeout(() => setStep(1), 1200)}
              />
            </h1>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8 sm:space-y-10 text-center w-full max-w-md px-2">
            <h2 className="text-lg sm:text-xl font-bold text-white">What brings you here?</h2>
            <div className="grid gap-2 sm:gap-3">
              {[
                { id: 'explore', label: "Exploring" },
                { id: 'plan', label: "Planning something" },
                { id: 'both', label: 'A bit of both' },
                { id: 'all', label: 'All events. Every single one.' },
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
                    setStep(2)
                  }}
                  className={`w-full text-center p-4 min-h-[48px] sm:min-h-[52px] flex items-center justify-center rounded-xl border transition-all touch-manipulation ${
                    prefs.intent === id
                      ? 'border-indigo-500 bg-indigo-500/20 text-white'
                      : id === 'all'
                        ? 'border-slate-600 bg-slate-800/40 text-slate-400 hover:border-slate-500 hover:text-slate-300 italic'
                        : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 sm:space-y-8 text-center w-full max-w-lg px-4 sm:px-0">
            <h2 className="text-lg sm:text-xl font-bold text-white">What interests you?</h2>
            <p className="text-slate-400 text-sm">Pick a few — or skip</p>
            <div className="space-y-5 sm:space-y-6 text-left max-h-[60vh] overflow-y-auto overscroll-contain pr-1 -mr-1">
              {ONBOARDING_TAG_GROUPS.map((group) => (
                <div key={group.id}>
                  <h3 className="text-sm font-medium text-slate-400 mb-2">{group.label}</h3>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    {group.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-2 min-h-[40px] rounded-lg text-sm transition-all touch-manipulation ${
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
                onClick={() => setStep(1)}
                className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-400 hover:text-white touch-manipulation"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2.5 min-h-[44px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 touch-manipulation"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 sm:space-y-8 text-center w-full max-w-lg px-4 sm:px-0">
            <h2 className="text-lg sm:text-xl font-bold text-white">Pick a vibe</h2>
            <p className="text-slate-400 text-sm">Optional</p>
            <div className="grid gap-3 sm:gap-4 text-left max-h-[55vh] overflow-y-auto overscroll-contain pr-1 -mr-1">
              {PREDEFINED_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    updatePrefs({
                      vibe: p.slug,
                      tags: [...new Set([...prefs.tags, ...p.tags])],
                    })
                    setStep(4)
                  }}
                  className={`text-left p-4 min-h-[72px] rounded-xl border transition-all touch-manipulation ${
                    prefs.vibe === p.slug
                      ? 'border-indigo-500 bg-indigo-500/20'
                      : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
                  }`}
                >
                  <span className="text-2xl mr-2">{p.emoji}</span>
                  <span className="font-medium text-white">{p.name}</span>
                  <p className="text-sm text-slate-400 mt-1">{p.description}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-center pt-4 flex-wrap">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-400 hover:text-white touch-manipulation"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-400 touch-manipulation"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 sm:space-y-8 text-center w-full max-w-md px-4 sm:px-0">
            <h2 className="text-lg sm:text-xl font-bold text-white">Any preferences?</h2>
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
                  <span className="text-slate-200">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 justify-center pt-4 flex-wrap">
              <button
                onClick={() => setStep(3)}
                className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-400 hover:text-white touch-manipulation"
              >
                Back
              </button>
              <button
                onClick={() => setStep(5)}
                className="px-6 py-2.5 min-h-[44px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 touch-manipulation"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-8 sm:space-y-10 text-center max-w-md px-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white">You&apos;re all set</h2>
            <p className="text-slate-400 text-sm">
              Your calendar, tailored to you.
            </p>
            <button
              onClick={handleEnterCalendar}
              disabled={submitting}
              className="px-8 py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:opacity-90 disabled:opacity-70 touch-manipulation"
            >
              {submitting ? 'Loading...' : 'Enter calendar'}
            </button>
            <p className="text-sm text-slate-500">
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
