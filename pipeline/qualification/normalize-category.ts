/**
 * Controlled category taxonomy for pipeline + publish.
 */

const CANONICAL = [
  'Music',
  'Nightlife',
  'Arts',
  'Theatre',
  'Film',
  'Comedy',
  'Food & Drink',
  'Sports',
  'Wellness',
  'Talks',
  'Festival',
  'Other',
] as const

export type CanonicalCategory = (typeof CANONICAL)[number]

const ALIASES: Record<string, CanonicalCategory> = {
  music: 'Music',
  musica: 'Music',
  música: 'Music',
  concert: 'Music',
  concerto: 'Music',
  live: 'Music',
  jazz: 'Music',
  dj: 'Nightlife',
  club: 'Nightlife',
  nightlife: 'Nightlife',
  party: 'Nightlife',
  festa: 'Nightlife',
  electronic: 'Nightlife',
  techno: 'Nightlife',
  house: 'Nightlife',
  art: 'Arts',
  arts: 'Arts',
  arte: 'Arts',
  exhibition: 'Arts',
  exposicao: 'Arts',
  exposição: 'Arts',
  theatre: 'Theatre',
  theater: 'Theatre',
  teatro: 'Theatre',
  dance: 'Arts',
  danca: 'Arts',
  dança: 'Arts',
  film: 'Film',
  cinema: 'Film',
  movie: 'Film',
  comedy: 'Comedy',
  comedia: 'Comedy',
  comédia: 'Comedy',
  food: 'Food & Drink',
  drink: 'Food & Drink',
  gastronomy: 'Food & Drink',
  sports: 'Sports',
  desporto: 'Sports',
  wellness: 'Wellness',
  yoga: 'Wellness',
  talks: 'Talks',
  talk: 'Talks',
  conference: 'Talks',
  festival: 'Festival',
  fest: 'Festival',
}

export function normalizeCategory(raw?: string): CanonicalCategory | '' {
  if (!raw?.trim()) return ''
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  if (ALIASES[key]) return ALIASES[key]
  for (const [alias, cat] of Object.entries(ALIASES)) {
    if (key.includes(alias)) return cat
  }
  // Title-case match against canonical
  const hit = CANONICAL.find((c) => c.toLowerCase() === key)
  return hit ?? 'Other'
}

export function canonicalCategories(): readonly string[] {
  return CANONICAL
}
