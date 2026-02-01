/**
 * Feature flags for enabling/disabling features
 */
export const FEATURE_FLAGS = {
  PROFILE_AUTH: process.env.NEXT_PUBLIC_ENABLE_PROFILE === 'true',
} as const

export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature] ?? false
}
