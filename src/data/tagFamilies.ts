/**
 * Tag families for sidebar filters, onboarding, and personas.
 * Keys are lowercase canonical forms (matched via toCanonicalTagKey).
 * Near-dupes that canonicalize identically (hip-hop / hip hop) are omitted.
 */

export interface TagFamily {
  id: string
  label: string
  /** Canonical lowercase tags belonging to this family */
  tags: string[]
}

export const TAG_FAMILIES: TagFamily[] = [
  {
    id: 'music',
    label: 'Music',
    tags: [
      'dj',
      'jazz',
      'concert',
      'rock',
      'house',
      'techno',
      'electronic',
      'live',
      'indie',
      'pop',
      'hip hop',
      'rap',
      'classical',
      'folk',
      'blues',
      'reggae',
      'fado',
      'acoustic',
      'post-punk',
      'alternative',
      'festival',
      'music',
    ],
  },
  {
    id: 'nightlife',
    label: 'Nightlife',
    tags: [
      'nightlife',
      'club',
      'party',
      'club night',
      'after hours',
      'warehouse',
      'underground',
      'rave',
    ],
  },
  {
    id: 'arts',
    label: 'Arts & Culture',
    tags: [
      'art',
      'exhibition',
      'museum',
      'gallery',
      'theatre',
      'performance',
      'experimental',
      'cultural',
      'installation',
      'photography',
      'sculpture',
      'painting',
    ],
  },
  {
    id: 'cinema',
    label: 'Cinema',
    tags: ['cinema', 'film', 'screening', 'movie'],
  },
  {
    id: 'comedy',
    label: 'Comedy',
    tags: ['comedy', 'stand up', 'improv'],
  },
  {
    id: 'dance',
    label: 'Dance & Performance',
    tags: ['dance', 'ballet', 'contemporary dance'],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    tags: [
      'food',
      'drink',
      'rooftop',
      'cocktail',
      'cocktail bar',
      'wine',
      'wine tasting',
      'natural wine',
      'brunch',
      'craft beer',
      'fine dining',
      'market',
    ],
  },
  {
    id: 'wellness',
    label: 'Wellness & Sport',
    tags: [
      'yoga',
      'running',
      'fitness',
      'wellness',
      'outdoor',
      'surf',
      'sports',
    ],
  },
  {
    id: 'literary',
    label: 'Literary & Talks',
    tags: [
      'literature',
      'poetry',
      'book',
      'book launch',
      'talk',
      'workshop',
      'storytelling',
    ],
  },
  {
    id: 'community',
    label: 'Community & Social',
    tags: [
      'community',
      'social',
      'meetup',
      'pop-up',
      'networking',
    ],
  },
]

/** Map canonical tag key → family id */
export function getTagFamilyId(tag: string, toKey: (t: string) => string): string | null {
  const key = toKey(tag)
  for (const family of TAG_FAMILIES) {
    if (family.tags.some((t) => toKey(t) === key)) return family.id
  }
  return null
}

/**
 * Group available tags into families. Tags that match a family go under it;
 * unmatched tags go into "Other". Empty families are omitted.
 */
export function groupTagsByFamily(
  availableTags: string[],
  toKey: (t: string) => string
): Array<{ id: string; label: string; tags: string[] }> {
  const byFamily = new Map<string, Set<string>>()
  const other = new Set<string>()

  for (const tag of availableTags) {
    const familyId = getTagFamilyId(tag, toKey)
    if (!familyId) {
      other.add(tag)
      continue
    }
    if (!byFamily.has(familyId)) byFamily.set(familyId, new Set())
    byFamily.get(familyId)!.add(tag)
  }

  const groups: Array<{ id: string; label: string; tags: string[] }> = []
  for (const family of TAG_FAMILIES) {
    const set = byFamily.get(family.id)
    if (!set || set.size === 0) continue
    groups.push({
      id: family.id,
      label: family.label,
      tags: Array.from(set).sort((a, b) => a.localeCompare(b)),
    })
  }
  if (other.size > 0) {
    groups.push({
      id: 'other',
      label: 'Other',
      tags: Array.from(other).sort((a, b) => a.localeCompare(b)),
    })
  }
  return groups
}
