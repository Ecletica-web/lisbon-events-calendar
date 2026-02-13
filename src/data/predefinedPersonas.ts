/**
 * Predefined Lisbon-style personas — global, non-editable filter presets.
 * One-click Lisbon vibe filters. Tags match event data via canonical key.
 */

export interface PredefinedPersona {
  id: string
  slug: string
  name: string
  description: string
  tags: string[]
  categories?: string[]
  accentColor?: string
  emoji?: string
  bgStyle?: string // Tailwind-ish or inline style for funky background
}

export const PREDEFINED_PERSONAS: PredefinedPersona[] = [
  {
    id: 'posh-kid',
    slug: 'posh-kid',
    name: 'The Posh Kid',
    emoji: '🥂',
    description: 'Private school energy. Natural wine. Rooftops. Clean sneakers. Probably knows someone at the door.',
    tags: [
      'Rooftop',
      'Cocktail Bar',
      'Fine Dining',
      'Wine Tasting',
      'Electronic',
      'House',
      'Tech House',
      'Fashion',
      'Art Exhibition',
      'DJ Set',
      'Brunch',
    ],
    accentColor: '#a78bfa',
    bgStyle: 'linear-gradient(135deg, rgba(167,139,250,0.25) 0%, rgba(236,72,153,0.15) 100%)',
  },
  {
    id: 'alternative-girl',
    emoji: '🖤',
    slug: 'alternative-girl',
    name: 'The Alternative Girl',
    description: 'Thrifted leather jacket. Knows underground venues. Avoids mainstream crowds.',
    tags: [
      'Post-Punk',
      'Indie Rock',
      'Alternative',
      'Experimental',
      'Darkwave',
      'Live Concert',
      'Small Venue',
      'Poetry',
      'Zine Fair',
      'Independent Cinema',
      'Art Collective',
    ],
    accentColor: '#ec4899',
    bgStyle: 'linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(107,114,128,0.2) 100%)',
  },
  {
    id: 'hipster',
    emoji: '🎸',
    slug: 'hipster',
    name: 'The Hipster',
    description: 'Already went there before it was cool.',
    tags: [
      'Indie',
      'Jazz',
      'Vinyl',
      'Art Exhibition',
      'Craft Beer',
      'Natural Wine',
      'Creative Meetup',
      'Photography',
      'Startup Event',
      'Film Screening',
    ],
    accentColor: '#f59e0b',
    bgStyle: 'linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(251,191,36,0.15) 100%)',
  },
  {
    id: 'sports-guy',
    emoji: '🏃',
    slug: 'sports-guy',
    name: 'The Sports Guy',
    description: 'Runs 10k before brunch.',
    tags: [
      'Running',
      'Football',
      'Surf',
      'Fitness',
      'CrossFit',
      'Outdoor Event',
      'Wellness',
      'Yoga',
      'Basketball',
      'Sports',
    ],
    accentColor: '#22c55e',
    bgStyle: 'linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(16,185,129,0.15) 100%)',
  },
  {
    id: 'bookworm',
    emoji: '📚',
    slug: 'bookworm',
    name: 'The Bookworm',
    description: 'Owns more books than shoes.',
    tags: [
      'Book Launch',
      'Literature',
      'Poetry',
      'Workshop',
      'Museum',
      'Theatre',
      'Classical Music',
      'Cultural Talk',
      'Philosophy',
      'Library',
    ],
    accentColor: '#8b5cf6',
    bgStyle: 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(244,114,182,0.15) 100%)',
  },
  {
    id: 'actress',
    emoji: '🎭',
    slug: 'actress',
    name: 'The Actress',
    description: 'Knows every experimental theatre space in Lisbon.',
    tags: [
      'Theatre',
      'Performance Art',
      'Experimental',
      'Dance',
      'Cinema',
      'Film Festival',
      'Acting',
      'Cultural Event',
      'Live Show',
      'Art Opening',
    ],
    accentColor: '#f472b6',
    bgStyle: 'linear-gradient(135deg, rgba(244,114,182,0.25) 0%, rgba(232,121,249,0.15) 100%)',
  },
  {
    id: 'instagram-explorer',
    emoji: '📸',
    slug: 'instagram-explorer',
    name: 'The Instagram Explorer',
    description: 'Here for the aesthetic.',
    tags: [
      'Rooftop',
      'Sunset',
      'Pop-Up',
      'Market',
      'Brunch',
      'Fashion',
      'Art Installation',
      'Outdoor Event',
      'DJ Set',
      'Trendy',
    ],
    accentColor: '#e879f9',
    bgStyle: 'linear-gradient(135deg, rgba(232,121,249,0.25) 0%, rgba(236,72,153,0.15) 100%)',
  },
  {
    id: 'raver',
    emoji: '🕺',
    slug: 'raver',
    name: 'The Raver',
    description: 'Sleeps at 8am.',
    tags: [
      'Techno',
      'House',
      'Hard Techno',
      'Electronic',
      'Club Night',
      'After Hours',
      'Warehouse',
      'DJ Set',
      'Festival',
      'Underground',
    ],
    accentColor: '#06b6d4',
    bgStyle: 'linear-gradient(135deg, rgba(6,182,212,0.25) 0%, rgba(139,92,246,0.1) 100%)',
  },
  {
    id: 'sunset-romantic',
    emoji: '🌅',
    slug: 'sunset-romantic',
    name: 'The Sunset Romantic',
    description: 'Golden hour specialist.',
    tags: [
      'Rooftop',
      'Sunset',
      'Acoustic',
      'Jazz',
      'Cocktail Bar',
      'Live Music',
      'Outdoor Event',
      'Beach',
      'Wine Tasting',
      'Chill',
    ],
    accentColor: '#f97316',
    bgStyle: 'linear-gradient(135deg, rgba(249,115,22,0.25) 0%, rgba(251,146,60,0.15) 100%)',
  },
]

export function getPredefinedPersonaBySlug(slug: string): PredefinedPersona | undefined {
  return PREDEFINED_PERSONAS.find((p) => p.slug === slug)
}

export function getPredefinedPersonaById(id: string): PredefinedPersona | undefined {
  return PREDEFINED_PERSONAS.find((p) => p.id === id)
}
