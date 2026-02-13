/**
 * Tag groups for onboarding — used for the multi-select step.
 * Groups are derived from predefined personas and event data.
 */

export interface OnboardingTagGroup {
  id: string
  label: string
  tags: string[]
}

export const ONBOARDING_TAG_GROUPS: OnboardingTagGroup[] = [
  { id: 'nightlife', label: 'Nightlife & Clubs', tags: ['Techno', 'House', 'Electronic', 'Club Night', 'DJ Set', 'After Hours', 'Warehouse', 'Underground'] },
  { id: 'arts', label: 'Arts & Culture', tags: ['Art Exhibition', 'Museum', 'Theatre', 'Film Screening', 'Performance Art', 'Experimental', 'Cultural Event', 'Art Collective'] },
  { id: 'music', label: 'Live Music', tags: ['Live Concert', 'Jazz', 'Indie Rock', 'Acoustic', 'Classical Music', 'Post-Punk', 'Alternative', 'Indie'] },
  { id: 'food', label: 'Food & Drink', tags: ['Rooftop', 'Cocktail Bar', 'Wine Tasting', 'Natural Wine', 'Brunch', 'Craft Beer', 'Fine Dining'] },
  { id: 'wellness', label: 'Wellness & Sport', tags: ['Yoga', 'Running', 'Fitness', 'Wellness', 'Outdoor Event', 'Surf', 'Sports'] },
  { id: 'creativity', label: 'Creative & Social', tags: ['Workshop', 'Creative Meetup', 'Photography', 'Poetry', 'Literature', 'Book Launch', 'Market', 'Pop-Up'] },
  { id: 'trendy', label: 'Trendy & Insta-worthy', tags: ['Fashion', 'Sunset', 'Beach', 'Chill', 'Trendy', 'Art Installation'] },
]
