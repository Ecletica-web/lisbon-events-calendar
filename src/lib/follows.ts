/**
 * User-to-user follow operations (Supabase)
 */

import { supabase } from './supabase/client'

export async function followUser(followerId: string, followingId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  if (followerId === followingId) return { error: 'Cannot follow yourself' }
  const { error } = await supabase
    .from('follows')
    .upsert({ follower_id: followerId, following_id: followingId }, { onConflict: 'follower_id,following_id' })
  return { error: error?.message }
}

export async function unfollowUser(followerId: string, followingId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  return { error: error?.message }
}

export async function getFollowersCount(userId: string): Promise<number> {
  if (!supabase) return 0
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId)
  return count ?? 0
}

export async function getFollowingCount(userId: string): Promise<number> {
  if (!supabase) return 0
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId)
  return count ?? 0
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  if (!supabase || followerId === followingId) return false
  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle()
  return !!data
}
