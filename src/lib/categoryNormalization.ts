/**
 * Category normalization to prevent duplicates like "art" and "arts"
 * Maps variations to a canonical category name
 */
export const CATEGORY_NORMALIZATION: Record<string, string> = {
  // Art variations
  'art': 'arts',
  'arts': 'arts',
  'artwork': 'arts',
  'artworks': 'arts',
  
  // Music variations
  'music': 'music',
  'musical': 'music',
  'musician': 'music',
  
  // Cinema/Film variations
  'cinema': 'cinema',
  'film': 'cinema',
  'films': 'cinema',
  'movie': 'cinema',
  'movies': 'cinema',
  'screening': 'cinema',
  'screenings': 'cinema',
  
  // Theatre variations
  'theatre': 'theatre',
  'theater': 'theatre',
  'theatres': 'theatre',
  'theaters': 'theatre',
  
  // Performance variations
  'performance': 'performance',
  'performances': 'performance',
  'performing': 'performance',
  
  // Comedy variations
  'comedy': 'comedy',
  'comedies': 'comedy',
  'standup': 'comedy',
  'stand-up': 'comedy',
  'stand up': 'comedy',
  
  // Nightlife variations
  'nightlife': 'nightlife',
  'night life': 'nightlife',
  'club': 'nightlife',
  'clubs': 'nightlife',
  'party': 'nightlife',
  'parties': 'nightlife',
  
  // Workshop variations
  'workshop': 'workshop',
  'workshops': 'workshop',
  'class': 'workshop',
  'classes': 'workshop',
  'course': 'workshop',
  'courses': 'workshop',
  
  // Food variations
  'food': 'food',
  'foods': 'food',
  'restaurant': 'food',
  'restaurants': 'food',
  'dining': 'food',
  
  // Market variations
  'market': 'market',
  'markets': 'market',
  'fair': 'market',
  'fairs': 'market',
  
  // Literature variations
  'literature': 'literature',
  'literary': 'literature',
  'poetry': 'literature',
  'poem': 'literature',
  'poems': 'literature',
  'reading': 'literature',
  'readings': 'literature',
  'book': 'literature',
  'books': 'literature',
  
  // Exhibition variations
  'exhibition': 'exhibition',
  'exhibitions': 'exhibition',
  'exhibit': 'exhibition',
  'exhibits': 'exhibition',
  'show': 'exhibition',
  'shows': 'exhibition',
  
  // Dance variations
  'dance': 'dance',
  'dancing': 'dance',
  'dances': 'dance',
  
  // Volunteer variations
  'volunteering': 'volunteering',
  'volunteer': 'volunteering',
  'volunteers': 'volunteering',
  
  // Community variations
  'community': 'community',
  'communities': 'community',
}

/**
 * Normalize a category name to its canonical form
 * @param category - The category to normalize
 * @returns The normalized category name, or the original if no normalization exists
 */
export function normalizeCategory(category: string): string {
  if (!category) return category
  
  const normalized = category.toLowerCase().trim()
  return CATEGORY_NORMALIZATION[normalized] || normalized
}

/**
 * Normalize an array of categories, removing duplicates
 * @param categories - Array of category names
 * @returns Array of unique normalized categories
 */
export function normalizeCategories(categories: string[]): string[] {
  const normalizedSet = new Set<string>()
  
  categories.forEach(category => {
    if (category) {
      const normalized = normalizeCategory(category)
      normalizedSet.add(normalized)
    }
  })
  
  return Array.from(normalizedSet).sort()
}
