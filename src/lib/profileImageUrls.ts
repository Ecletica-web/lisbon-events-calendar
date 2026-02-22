import { supabaseServer } from '@/lib/supabase/server'

const PROFILE_IMAGES_BUCKET = 'profile-images'

/**
 * Resolve profile image URL for display.
 * - Path-only (e.g. "userId/avatar-123.jpg") → full public URL (bucket is public).
 * - Full URL for our bucket → return as-is (public bucket, no signed URL needed).
 * - External URL (e.g. OAuth avatar) → return as-is.
 */
export async function ensureViewableProfileImageUrl(url: string | null): Promise<string | null> {
  if (!url || !supabaseServer) return url
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (!supabaseUrl) return url

  if (!url.startsWith('http')) {
    const path = url.replace(/^\//, '').trim()
    if (!path) return url
    const { data } = supabaseServer.storage.from(PROFILE_IMAGES_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  return url
}
