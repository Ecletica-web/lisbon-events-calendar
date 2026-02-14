/**
 * Database schema definitions
 * For MVP, we'll use a simple JSON file-based approach
 * In production, this would be replaced with a proper database
 */

export interface SavedViewRow {
  id: string
  user_id: string
  name: string
  state_json: string // JSON string of ViewState
  is_default: boolean
  is_public: boolean
  share_slug: string // stable slug for /v/[slug], unique
  created_at: string
  updated_at: string
}

/** Persona rules applied as filter presets */
export interface PersonaRules {
  includeTags?: string[]
  excludeTags?: string[]
  includeCategories?: string[]
  excludeCategories?: string[]
  includeVenues?: string[]
  freeOnly?: boolean
  language?: string
  timeWindow?: { start?: string; end?: string }
  /** Weight preferences for For You scoring */
  prefer_free?: boolean
  energy_level?: 'low' | 'medium' | 'high'
  budget_range?: [number, number]
  neighborhoods?: string[]
  time_preference?: 'day' | 'night' | 'late'
}

export interface PersonaRow {
  id: string
  owner_user_id: string
  title: string
  slug: string
  description_short?: string
  rules_json: string
  is_public: boolean
  share_slug: string
  created_at: string
  updated_at: string
}

export interface FollowRow {
  id: string
  user_id: string
  type: 'tag' | 'venue' | 'source' | 'artist'
  normalized_value: string
  display_value: string
  created_at: string
}

export interface NotificationSettingsRow {
  user_id: string
  email_enabled: boolean
  digest_frequency: 'daily' | 'weekly' | 'never'
  instant_enabled: boolean
  timezone: string
  updated_at: string
}

export interface UserRow {
  id: string
  email: string
  name?: string
  password_hash?: string // Hashed password for email/password auth
  created_at: string
  updated_at: string
}
