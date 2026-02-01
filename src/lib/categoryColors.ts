/**
 * Category color mapping for events
 * Each category gets a distinct color for visual organization
 */
export const CATEGORY_COLORS: Record<string, string> = {
  // Arts & Culture
  arts: '#8B5CF6', // Purple
  art: '#8B5CF6',
  exhibition: '#8B5CF6',
  museum: '#8B5CF6',
  gallery: '#8B5CF6',
  // Art Styles
  contemporary: '#8B5CF6',
  modern: '#8B5CF6',
  abstract: '#8B5CF6',
  'street-art': '#8B5CF6',
  streetart: '#8B5CF6',
  photography: '#8B5CF6',
  sculpture: '#8B5CF6',
  painting: '#8B5CF6',
  drawing: '#8B5CF6',
  installation: '#8B5CF6',
  digital: '#8B5CF6',
  mixed: '#8B5CF6',
  'mixed-media': '#8B5CF6',
  conceptual: '#8B5CF6',
  
  // Music
  music: '#EF4444', // Red
  concert: '#EF4444',
  live: '#EF4444',
  dj: '#EF4444',
  festival: '#EF4444',
  // Music Genres
  rock: '#EF4444',
  jazz: '#EF4444',
  blues: '#EF4444',
  electronic: '#EF4444',
  'hip-hop': '#EF4444',
  hiphop: '#EF4444',
  rap: '#EF4444',
  classical: '#EF4444',
  folk: '#EF4444',
  indie: '#EF4444',
  pop: '#EF4444',
  techno: '#EF4444',
  house: '#EF4444',
  reggae: '#EF4444',
  fado: '#EF4444',
  acoustic: '#EF4444',
  
  // Cinema
  cinema: '#3B82F6', // Blue
  film: '#3B82F6',
  screening: '#3B82F6',
  movie: '#3B82F6',
  
  // Theatre & Performance
  theatre: '#10B981', // Green
  theater: '#10B981',
  performance: '#10B981',
  dance: '#10B981',
  ballet: '#10B981',
  
  // Comedy
  comedy: '#F59E0B', // Amber
  standup: '#F59E0B',
  'stand-up': '#F59E0B',
  
  // Nightlife
  nightlife: '#EC4899', // Pink
  club: '#EC4899',
  party: '#EC4899',
  
  // Workshops & Education
  workshop: '#06B6D4', // Cyan
  class: '#06B6D4',
  course: '#06B6D4',
  education: '#06B6D4',
  
  // Food & Drink
  food: '#F97316', // Orange
  drink: '#F97316',
  restaurant: '#F97316',
  tasting: '#F97316',
  
  // Sports & Fitness
  sports: '#84CC16', // Lime
  fitness: '#84CC16',
  yoga: '#84CC16',
  
  // Voluntary Work & Community
  volunteering: '#14B8A6', // Teal
  volunteer: '#14B8A6',
  community: '#14B8A6',
  charity: '#14B8A6',
  nonprofit: '#14B8A6',
  'non-profit': '#14B8A6',
  social: '#14B8A6',
  activism: '#14B8A6',
  outreach: '#14B8A6',
  
  // Literature & Poetry
  literature: '#92400E', // Brown
  poetry: '#92400E',
  reading: '#92400E',
  book: '#92400E',
  books: '#92400E',
  author: '#92400E',
  'book-club': '#92400E',
  bookclub: '#92400E',
  storytelling: '#92400E',
  
  // Markets & Fairs
  market: '#FBBF24', // Amber
  markets: '#FBBF24',
  fair: '#FBBF24',
  'flea-market': '#FBBF24',
  fleamarket: '#FBBF24',
  'craft-fair': '#FBBF24',
  craftfair: '#FBBF24',
  vendors: '#FBBF24',
  
  // Default
  default: '#6B7280', // Gray
}

/**
 * Get color for a category
 */
export function getCategoryColor(category?: string): string {
  if (!category) return CATEGORY_COLORS.default
  
  const normalized = category.toLowerCase().trim()
  return CATEGORY_COLORS[normalized] || CATEGORY_COLORS.default
}

/**
 * Generate a color from a string (for categories not in the map)
 */
export function generateColorFromString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  // Generate a color with good contrast
  const hue = hash % 360
  const saturation = 65 + (hash % 20) // 65-85%
  const lightness = 45 + (hash % 15) // 45-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

/**
 * Get all available category colors
 */
export function getAllCategoryColors(): Record<string, string> {
  return CATEGORY_COLORS
}
