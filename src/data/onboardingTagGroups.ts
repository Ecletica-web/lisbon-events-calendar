/**
 * Tag groups for onboarding — mirrors TAG_FAMILIES with Title Case labels for display.
 */

import { TAG_FAMILIES, type TagFamily } from '@/data/tagFamilies'

export interface OnboardingTagGroup {
  id: string
  label: string
  tags: string[]
}

function toTitle(tag: string): string {
  return tag
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export const ONBOARDING_TAG_GROUPS: OnboardingTagGroup[] = TAG_FAMILIES.map((f: TagFamily) => ({
  id: f.id,
  label: f.label,
  tags: f.tags.slice(0, 10).map(toTitle),
}))
