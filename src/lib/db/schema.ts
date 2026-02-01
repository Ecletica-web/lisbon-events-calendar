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
