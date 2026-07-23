/**
 * Category colors — grayscale for Pager retro B&W theme.
 * Distinct luminance levels so categories stay visually separable.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  arts: '#d4d4d4',
  art: '#d4d4d4',
  exhibition: '#d4d4d4',
  museum: '#d4d4d4',
  gallery: '#d4d4d4',
  contemporary: '#d4d4d4',
  modern: '#d4d4d4',
  abstract: '#d4d4d4',
  'street-art': '#d4d4d4',
  streetart: '#d4d4d4',
  photography: '#d4d4d4',
  sculpture: '#d4d4d4',
  painting: '#d4d4d4',
  drawing: '#d4d4d4',
  installation: '#d4d4d4',
  digital: '#d4d4d4',
  mixed: '#d4d4d4',
  'mixed-media': '#d4d4d4',
  conceptual: '#d4d4d4',

  music: '#fafafa',
  concert: '#fafafa',
  live: '#fafafa',
  dj: '#fafafa',
  festival: '#fafafa',
  rock: '#fafafa',
  jazz: '#fafafa',
  blues: '#fafafa',
  electronic: '#fafafa',
  'hip-hop': '#fafafa',
  hiphop: '#fafafa',
  rap: '#fafafa',
  classical: '#fafafa',
  folk: '#fafafa',
  indie: '#fafafa',
  pop: '#fafafa',
  techno: '#fafafa',
  house: '#fafafa',
  reggae: '#fafafa',
  fado: '#fafafa',
  acoustic: '#fafafa',

  cinema: '#a3a3a3',
  film: '#a3a3a3',
  screening: '#a3a3a3',
  movie: '#a3a3a3',

  theatre: '#737373',
  theater: '#737373',
  performance: '#737373',
  dance: '#737373',
  ballet: '#737373',

  comedy: '#e5e5e5',
  standup: '#e5e5e5',
  'stand-up': '#e5e5e5',

  nightlife: '#525252',
  club: '#525252',
  party: '#525252',

  workshop: '#b0b0b0',
  class: '#b0b0b0',
  course: '#b0b0b0',
  education: '#b0b0b0',

  food: '#c4c4c4',
  drink: '#c4c4c4',
  restaurant: '#c4c4c4',
  tasting: '#c4c4c4',

  sports: '#8a8a8a',
  fitness: '#8a8a8a',
  yoga: '#8a8a8a',

  volunteering: '#6b6b6b',
  volunteer: '#6b6b6b',
  community: '#6b6b6b',
  charity: '#6b6b6b',
  nonprofit: '#6b6b6b',
  'non-profit': '#6b6b6b',
  social: '#6b6b6b',
  activism: '#6b6b6b',
  outreach: '#6b6b6b',

  literature: '#9ca3af',
  poetry: '#9ca3af',
  reading: '#9ca3af',
  book: '#9ca3af',
  books: '#9ca3af',
  author: '#9ca3af',
  'book-club': '#9ca3af',
  bookclub: '#9ca3af',
  storytelling: '#9ca3af',

  market: '#d1d5db',
  markets: '#d1d5db',
  fair: '#d1d5db',
  'flea-market': '#d1d5db',
  fleamarket: '#d1d5db',
  'craft-fair': '#d1d5db',
  craftfair: '#d1d5db',
  vendors: '#d1d5db',

  default: '#737373',
}

export function getCategoryColor(category?: string): string {
  if (!category) return CATEGORY_COLORS.default
  const normalized = category.toLowerCase().trim()
  return CATEGORY_COLORS[normalized] || CATEGORY_COLORS.default
}

/** Deterministic gray from string (for unknown categories). */
export function generateColorFromString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const lightness = 35 + Math.abs(hash % 45)
  return `hsl(0, 0%, ${lightness}%)`
}

export function getAllCategoryColors(): Record<string, string> {
  return CATEGORY_COLORS
}
