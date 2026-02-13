'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import TypewriterText from '@/components/TypewriterText'
import { ONBOARDING_TAG_GROUPS } from '@/data/onboardingTagGroups'
import { PREDEFINED_PERSONAS } from '@/data/predefinedPersonas'
import {
  buildCalendarUrl,
  loadOnboardingFromStorage,
  saveOnboardingToStorage,
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
    saveOnboardingToStorage(prefs)

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

    router.push(buildCalendarUrl(prefs))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center pt-24">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
        {step === 0 && (
          <div className="text-center space-y-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              <TypewriterText
                text="Welcome to Lisbon Events. What brings you here?"
                speed={50}
                onComplete={() => setTimeout(() => setStep(1), 800)}
              />
            </h1>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-white">What&apos;s your main goal?</h2>
            <div className="grid gap-3">
              {[
                { id: 'explore', label: "I'm exploring — show me what's happening" },
                { id: 'plan', label: "I'm planning — help me find specific events" },
                { id: 'both', label: 'A bit of both' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => {
                    updatePrefs({ intent: id })
                    setStep(2)
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    prefs.intent === id
                      ? 'border-indigo-500 bg-indigo-500/20 text-white'
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
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Pick what you&apos;re into</h2>
            <p className="text-slate-400">Select any tags that interest you</p>
            <div className="space-y-6">
              {ONBOARDING_TAG_GROUPS.map((group) => (
                <div key={group.id}>
                  <h3 className="text-sm font-medium text-slate-400 mb-2">{group.label}</h3>
                  <div className="flex flex-wrap gap-2">
                    {group.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
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
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Pick your vibe</h2>
            <p className="text-slate-400">Which persona fits you best?</p>
            <div className="grid gap-4">
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
                  className={`text-left p-4 rounded-xl border transition-all ${
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
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="px-4 py-2 rounded-lg text-slate-400"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Any preferences?</h2>
            <div className="space-y-4">
              {[
                { key: 'freeOnly', label: 'Free events only' },
                { key: 'englishFriendly', label: 'English-friendly events' },
                { key: 'accessible', label: 'Accessible venues' },
                { key: 'avoidSoldOut', label: 'Avoid sold-out events' },
                { key: 'nearMe', label: 'Events near me' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 cursor-pointer p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={prefs[key as keyof OnboardingPrefs] as boolean}
                    onChange={(e) =>
                      updatePrefs({ [key]: e.target.checked } as Partial<OnboardingPrefs>)
                    }
                    className="rounded border-slate-600 text-indigo-600 w-5 h-5"
                  />
                  <span className="text-slate-200">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
              >
                Back
              </button>
              <button
                onClick={() => setStep(5)}
                className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-8 text-center">
            <h2 className="text-3xl font-bold text-white">You&apos;re all set</h2>
            <p className="text-slate-400">
              Your calendar will be tailored to your choices. You can always change these in
              Settings.
            </p>
            <button
              onClick={handleEnterCalendar}
              disabled={submitting}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:opacity-90 disabled:opacity-70"
            >
              {submitting ? 'Loading...' : 'Enter calendar'}
            </button>
            <p className="text-sm text-slate-500">
              <Link href="/calendar" className="text-slate-400 hover:text-white">
                Skip and go to calendar
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
