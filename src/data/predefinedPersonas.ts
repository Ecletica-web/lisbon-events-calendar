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
    accentColor: '#000000',
    bgStyle: 'linear-gradient(135deg, rgba(0,0,0,0.12) 0%, rgba(120,120,120,0.08) 100%)',
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
    accentColor: '#111111',
    bgStyle: 'linear-gradient(135deg, rgba(17,17,17,0.15) 0%, rgba(80,80,80,0.1) 100%)',
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
    accentColor: '#333333',
    bgStyle: 'linear-gradient(135deg, rgba(51,51,51,0.14) 0%, rgba(160,160,160,0.08) 100%)',
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
    accentColor: '#444444',
    bgStyle: 'linear-gradient(135deg, rgba(68,68,68,0.14) 0%, rgba(140,140,140,0.08) 100%)',
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
    accentColor: '#222222',
    bgStyle: 'linear-gradient(135deg, rgba(34,34,34,0.14) 0%, rgba(100,100,100,0.08) 100%)',
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
    accentColor: '#555555',
    bgStyle: 'linear-gradient(135deg, rgba(85,85,85,0.14) 0%, rgba(180,180,180,0.08) 100%)',
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
    accentColor: '#666666',
    bgStyle: 'linear-gradient(135deg, rgba(102,102,102,0.14) 0%, rgba(200,200,200,0.08) 100%)',
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
    accentColor: '#000000',
    bgStyle: 'linear-gradient(135deg, rgba(0,0,0,0.18) 0%, rgba(90,90,90,0.1) 100%)',
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
    accentColor: '#888888',
    bgStyle: 'linear-gradient(135deg, rgba(136,136,136,0.14) 0%, rgba(220,220,220,0.08) 100%)',
  },
]

export function getPredefinedPersonaBySlug(slug: string): PredefinedPersona | undefined {
  return PREDEFINED_PERSONAS.find((p) => p.slug === slug)
}

export function getPredefinedPersonaById(id: string): PredefinedPersona | undefined {
  return PREDEFINED_PERSONAS.find((p) => p.id === id)
}
