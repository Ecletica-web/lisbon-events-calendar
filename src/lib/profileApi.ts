/**
 * Profile API helpers — parse and validate profile update body for API routes
 */

export interface ProfileUpdateResult {
  success: true
  updates: Record<string, unknown>
}

export interface ProfileUpdateError {
  success: false
  error: string
  status: number
}

/**
 * Parse and validate profile update request body.
 * Returns updates object or error with message and status code.
 */
export function parseProfileUpdateBody(body: unknown): ProfileUpdateResult | ProfileUpdateError {
  if (!body || typeof body !== 'object') {
    return { success: false, error: 'Invalid body', status: 400 }
  }

  const b = body as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (typeof b.cover_url === 'string') {
    updates.cover_url = b.cover_url || null
  }
  if (typeof b.username === 'string') {
    const u = b.username.trim().toLowerCase()
    if (u.length > 0) {
      if (u.length < 3 || u.length > 30) {
        return { success: false, error: 'Username must be 3–30 characters', status: 400 }
      }
      if (!/^[a-z0-9_]+$/.test(u)) {
        return {
          success: false,
          error: 'Username can only contain lowercase letters, numbers, and underscores',
          status: 400,
        }
      }
      updates.username = u
    } else {
      updates.username = null
    }
  }
  if (typeof b.bio === 'string') {
    const bio = b.bio.trim()
    if (bio.length > 200) {
      return { success: false, error: 'Bio must be 200 characters or less', status: 400 }
    }
    updates.bio = bio || null
  }
  if (typeof b.display_name === 'string') {
    updates.display_name = b.display_name.trim() || null
  }
  if (typeof b.avatar_url === 'string') {
    updates.avatar_url = b.avatar_url || null
  }
  if (typeof b.event_visibility === 'string' && ['public', 'friends_only'].includes(b.event_visibility)) {
    updates.event_visibility = b.event_visibility
  }

  // Onboarding preferences
  if (typeof b.onboarding_complete === 'boolean') {
    updates.onboarding_complete = b.onboarding_complete
  }
  if (typeof b.onboarding_intent === 'string') {
    updates.onboarding_intent = b.onboarding_intent.trim() || null
  }
  if (Array.isArray(b.onboarding_tags)) {
    updates.onboarding_tags = b.onboarding_tags.filter((t: unknown) => typeof t === 'string' && t.trim())
  }
  if (typeof b.onboarding_vibe === 'string') {
    updates.onboarding_vibe = b.onboarding_vibe.trim() || null
  }
  if (typeof b.onboarding_free_only === 'boolean') {
    updates.onboarding_free_only = b.onboarding_free_only
  }
  if (typeof b.onboarding_english_friendly === 'boolean') {
    updates.onboarding_english_friendly = b.onboarding_english_friendly
  }
  if (typeof b.onboarding_accessible === 'boolean') {
    updates.onboarding_accessible = b.onboarding_accessible
  }
  if (typeof b.onboarding_avoid_sold_out === 'boolean') {
    updates.onboarding_avoid_sold_out = b.onboarding_avoid_sold_out
  }
  if (typeof b.onboarding_near_me === 'boolean') {
    updates.onboarding_near_me = b.onboarding_near_me
  }
  if (typeof b.onboarding_lat === 'number') {
    updates.onboarding_lat = b.onboarding_lat
  }
  if (typeof b.onboarding_lng === 'number') {
    updates.onboarding_lng = b.onboarding_lng
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: 'No valid fields to update', status: 400 }
  }

  return { success: true, updates }
}
