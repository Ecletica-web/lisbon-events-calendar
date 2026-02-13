/**
 * Onboarding helpers — build calendar URL and localStorage keys.
 * Onboarding is standalone at /onboarding; not triggered by login/signup.
 */

import { serializeViewStateToURL, mergeViewState } from './viewState'
import type { ViewState } from './viewState'

export const ONBOARDING_STORAGE_KEY = 'lisbon_onboarding_prefs'

export interface OnboardingPrefs {
  intent?: string
  tags: string[]
  vibe?: string
  freeOnly: boolean
  englishFriendly: boolean
  accessible: boolean
  avoidSoldOut: boolean
  nearMe: boolean
  lat?: number
  lng?: number
}

export function onboardingPrefsToViewState(prefs: OnboardingPrefs): Partial<ViewState> {
  const tags = prefs.tags?.length ? prefs.tags : []
  const partial: Partial<ViewState> = {
    selectedTags: tags,
    toggles: {
      freeOnly: prefs.freeOnly ?? false,
      excludeExhibitions: false,
      excludeContinuous: false,
    },
  }
  return partial
}

export function buildCalendarUrl(prefs: OnboardingPrefs): string {
  const partial = onboardingPrefsToViewState(prefs)
  const full = mergeViewState(partial)
  const params = serializeViewStateToURL(full)
  const search = new URLSearchParams(params).toString()
  return search ? `/calendar?${search}` : '/calendar'
}

export function loadOnboardingFromStorage(): OnboardingPrefs | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OnboardingPrefs>
    return {
      intent: parsed.intent,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      vibe: parsed.vibe,
      freeOnly: !!parsed.freeOnly,
      englishFriendly: !!parsed.englishFriendly,
      accessible: !!parsed.accessible,
      avoidSoldOut: !!parsed.avoidSoldOut,
      nearMe: !!parsed.nearMe,
      lat: parsed.lat,
      lng: parsed.lng,
    }
  } catch {
    return null
  }
}

export function saveOnboardingToStorage(prefs: OnboardingPrefs): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}
