/**
 * Friend request operations (Supabase)
 * Friends = mutual accepted friend requests
 */

import { supabase } from './supabase/client'

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected'

export async function sendFriendRequest(requesterId: string, addresseeId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  if (requesterId === addresseeId) return { error: 'Cannot send request to yourself' }
  const { error } = await supabase
    .from('friend_requests')
    .upsert(
      { requester_id: requesterId, addressee_id: addresseeId, status: 'pending', updated_at: new Date().toISOString() },
      { onConflict: 'requester_id,addressee_id' }
    )
  return { error: error?.message }
}

export async function acceptFriendRequest(requesterId: string, addresseeId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('requester_id', requesterId)
    .eq('addressee_id', addresseeId)
    .eq('status', 'pending')
  return { error: error?.message }
}

export async function rejectFriendRequest(requesterId: string, addresseeId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('requester_id', requesterId)
    .eq('addressee_id', addresseeId)
    .eq('status', 'pending')
  return { error: error?.message }
}

export async function cancelFriendRequest(requesterId: string, addresseeId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('requester_id', requesterId)
    .eq('addressee_id', addresseeId)
    .eq('status', 'pending')
  return { error: error?.message }
}

export async function unfriend(userId: string, friendId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const { data } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`)
    .maybeSingle()
  if (!data) return { error: 'Not friends' }
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('id', data.id)
  return { error: error?.message }
}

export async function areFriends(userIdA: string, userIdB: string): Promise<boolean> {
  if (!supabase || userIdA === userIdB) return false
  const { data } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${userIdA},addressee_id.eq.${userIdB}),and(requester_id.eq.${userIdB},addressee_id.eq.${userIdA})`)
    .maybeSingle()
  return !!data
}

/** Status relative to viewer: 'friends' | 'pending_sent' | 'pending_received' | null */
export async function getFriendStatus(viewerId: string, targetId: string): Promise<'friends' | 'pending_sent' | 'pending_received' | null> {
  if (!supabase || viewerId === targetId) return null
  const { data } = await supabase
    .from('friend_requests')
    .select('requester_id,status')
    .or(`and(requester_id.eq.${viewerId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${viewerId})`)
    .maybeSingle()
  if (!data) return null
  if (data.status === 'accepted') return 'friends'
  if (data.requester_id === viewerId) return 'pending_sent'
  return 'pending_received'
}
