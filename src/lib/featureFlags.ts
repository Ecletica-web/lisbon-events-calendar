/**
 * Feature flags for enabling/disabling features
 * All default OFF — set in .env.local to enable
 */
export const FEATURE_FLAGS = {
  PROFILE_AUTH: process.env.NEXT_PUBLIC_ENABLE_PROFILE === 'true',
  PERSONAS: process.env.NEXT_PUBLIC_ENABLE_PERSONAS === 'true',
  SHARED_VIEWS: process.env.NEXT_PUBLIC_ENABLE_SHARED_VIEWS === 'true',
} as const

export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature] ?? false
}
