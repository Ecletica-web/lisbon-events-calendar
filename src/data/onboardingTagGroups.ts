/**
 * Curated tag groups for onboarding — tighter than TAG_FAMILIES (no near-dupes).
 * Display labels are Title Case; matching still goes through toCanonicalTagKey.
 */

export interface OnboardingTagGroup {
  id: string
  label: string
  tags: string[]
}

export const ONBOARDING_TAG_GROUPS: OnboardingTagGroup[] = [
  {
    id: 'music',
    label: 'Music',
    tags: [
      'DJ',
      'Jazz',
      'Concert',
      'Rock',
      'House',
      'Techno',
      'Electronic',
      'Indie',
      'Hip Hop',
      'Classical',
      'Fado',
      'Festival',
    ],
  },
  {
    id: 'nightlife',
    label: 'Nightlife',
    tags: ['Club', 'Party', 'After Hours', 'Warehouse', 'Underground', 'Rave'],
  },
  {
    id: 'arts',
    label: 'Arts & Culture',
    tags: ['Exhibition', 'Museum', 'Gallery', 'Theatre', 'Performance', 'Experimental'],
  },
  {
    id: 'cinema',
    label: 'Cinema',
    tags: ['Cinema', 'Film Screening'],
  },
  {
    id: 'comedy',
    label: 'Comedy',
    tags: ['Comedy', 'Stand Up', 'Improv'],
  },
  {
    id: 'dance',
    label: 'Dance & Performance',
    tags: ['Dance', 'Ballet'],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    tags: ['Rooftop', 'Cocktail Bar', 'Wine Tasting', 'Brunch', 'Craft Beer', 'Market'],
  },
  {
    id: 'wellness',
    label: 'Wellness & Sport',
    tags: ['Yoga', 'Running', 'Fitness', 'Surf', 'Outdoor'],
  },
  {
    id: 'literary',
    label: 'Literary & Talks',
    tags: ['Poetry', 'Book Launch', 'Workshop', 'Talk'],
  },
  {
    id: 'community',
    label: 'Community & Social',
    tags: ['Meetup', 'Pop-Up', 'Networking'],
  },
]
