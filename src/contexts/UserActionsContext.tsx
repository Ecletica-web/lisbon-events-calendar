'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import {
  followVenue,
  unfollowVenue,
  followPromoter,
  unfollowPromoter,
  addToWishlist,
  removeFromWishlist,
  likeEvent,
  unlikeEvent,
  fetchUserActionsBulk,
  type UserActionsBulk,
} from '@/lib/userActions'
import { setEventAction, removeEventAction } from '@/lib/eventActions'

interface UserActionsContextValue {
  actions: UserActionsBulk
  loading: boolean
  refetch: () => Promise<void>
  followVenue: (venueId: string) => Promise<boolean>
  unfollowVenue: (venueId: string) => Promise<boolean>
  isFollowingVenue: (venueId: string) => boolean
  followPromoter: (promoterId: string) => Promise<boolean>
  unfollowPromoter: (promoterId: string) => Promise<boolean>
  isFollowingPromoter: (promoterId: string) => boolean
  addToWishlist: (eventId: string) => Promise<boolean>
  removeFromWishlist: (eventId: string) => Promise<boolean>
  isWishlisted: (eventId: string) => boolean
  likeEvent: (eventId: string) => Promise<boolean>
  unlikeEvent: (eventId: string) => Promise<boolean>
  isLiked: (eventId: string) => boolean
  setGoing: (eventId: string, value: boolean) => Promise<boolean>
  setInterested: (eventId: string, value: boolean) => Promise<boolean>
  setReminder: (eventId: string, value: boolean, hoursBefore?: number) => Promise<boolean>
  isGoing: (eventId: string) => boolean
  isInterested: (eventId: string) => boolean
  hasReminder: (eventId: string) => boolean
}

const defaultBulk: UserActionsBulk = {
  followedVenueIds: new Set(),
  followedPromoterIds: new Set(),
  wishlistedEventIds: new Set(),
  likedEventIds: new Set(),
  goingIds: new Set(),
  interestedIds: new Set(),
  reminderIds: new Set(),
}

const UserActionsContext = createContext<UserActionsContextValue | null>(null)

export function useUserActions() {
  return useContext(UserActionsContext)
}

function normalizeId(id: string): string {
  return (id || '').toLowerCase().trim()
}

function normalizeEventId(id: string): string {
  return (id || '').toLowerCase().trim()
}

export function UserActionsProvider({ children }: { children: ReactNode }) {
  const auth = useSupabaseAuth()
  const user = auth?.user
  const isConfigured = auth?.isConfigured ?? false
  const [actions, setActions] = useState<UserActionsBulk>(defaultBulk)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    if (!user?.id || !isConfigured) {
      setActions(defaultBulk)
      return
    }
    setLoading(true)
    try {
      const bulk = await fetchUserActionsBulk(user.id)
      setActions(bulk)
    } catch (e) {
      console.error('Failed to fetch user actions', e)
    } finally {
      setLoading(false)
    }
  }, [user?.id, isConfigured])

  useEffect(() => {
    refetch()
  }, [refetch])

  const handleFollowVenue = useCallback(
    async (venueId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeId(venueId)
      setActions((prev) => ({
        ...prev,
        followedVenueIds: new Set(prev.followedVenueIds).add(key),
      }))
      const { error } = await followVenue(user.id, key)
      if (error) {
        setActions((prev) => {
          const next = new Set(prev.followedVenueIds)
          next.delete(key)
          return { ...prev, followedVenueIds: next }
        })
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleUnfollowVenue = useCallback(
    async (venueId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeId(venueId)
      setActions((prev) => {
        const next = new Set(prev.followedVenueIds)
        next.delete(key)
        return { ...prev, followedVenueIds: next }
      })
      const { error } = await unfollowVenue(user.id, key)
      if (error) {
        setActions((prev) => ({
          ...prev,
          followedVenueIds: new Set(prev.followedVenueIds).add(key),
        }))
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleFollowPromoter = useCallback(
    async (promoterId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeId(promoterId)
      setActions((prev) => ({
        ...prev,
        followedPromoterIds: new Set(prev.followedPromoterIds).add(key),
      }))
      const { error } = await followPromoter(user.id, key)
      if (error) {
        setActions((prev) => {
          const next = new Set(prev.followedPromoterIds)
          next.delete(key)
          return { ...prev, followedPromoterIds: next }
        })
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleUnfollowPromoter = useCallback(
    async (promoterId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeId(promoterId)
      setActions((prev) => {
        const next = new Set(prev.followedPromoterIds)
        next.delete(key)
        return { ...prev, followedPromoterIds: next }
      })
      const { error } = await unfollowPromoter(user.id, key)
      if (error) {
        setActions((prev) => ({
          ...prev,
          followedPromoterIds: new Set(prev.followedPromoterIds).add(key),
        }))
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleAddToWishlist = useCallback(
    async (eventId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeEventId(eventId)
      setActions((prev) => ({
        ...prev,
        wishlistedEventIds: new Set(prev.wishlistedEventIds).add(key),
      }))
      const { error } = await addToWishlist(user.id, eventId)
      if (error) {
        setActions((prev) => {
          const next = new Set(prev.wishlistedEventIds)
          next.delete(key)
          return { ...prev, wishlistedEventIds: next }
        })
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleRemoveFromWishlist = useCallback(
    async (eventId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeEventId(eventId)
      setActions((prev) => {
        const next = new Set(prev.wishlistedEventIds)
        next.delete(key)
        return { ...prev, wishlistedEventIds: next }
      })
      const { error } = await removeFromWishlist(user.id, eventId)
      if (error) {
        setActions((prev) => ({
          ...prev,
          wishlistedEventIds: new Set(prev.wishlistedEventIds).add(key),
        }))
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleLikeEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeEventId(eventId)
      setActions((prev) => ({
        ...prev,
        likedEventIds: new Set(prev.likedEventIds).add(key),
      }))
      const { error } = await likeEvent(user.id, eventId)
      if (error) {
        setActions((prev) => {
          const next = new Set(prev.likedEventIds)
          next.delete(key)
          return { ...prev, likedEventIds: next }
        })
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleUnlikeEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeEventId(eventId)
      setActions((prev) => {
        const next = new Set(prev.likedEventIds)
        next.delete(key)
        return { ...prev, likedEventIds: next }
      })
      const { error } = await unlikeEvent(user.id, eventId)
      if (error) {
        setActions((prev) => ({
          ...prev,
          likedEventIds: new Set(prev.likedEventIds).add(key),
        }))
        return false
      }
      return true
    },
    [user?.id]
  )

  const handleSetGoing = useCallback(
    async (eventId: string, value: boolean): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeEventId(eventId)
      if (value) {
        setActions((prev) => ({
          ...prev,
          goingIds: new Set(prev.goingIds).add(key),
        }))
        const { error } = await setEventAction(user.id, eventId, 'going')
        if (error) {
          setActions((prev) => {
            const next = new Set(prev.goingIds)
            next.delete(key)
            return { ...prev, goingIds: next }
          })
          return false
        }
      } else {
        setActions((prev) => {
          const next = new Set(prev.goingIds)
          next.delete(key)
          return { ...prev, goingIds: next }
        })
        const { error } = await removeEventAction(user.id, eventId, 'going')
        if (error) {
          setActions((prev) => ({
            ...prev,
            goingIds: new Set(prev.goingIds).add(key),
          }))
          return false
        }
      }
      return true
    },
    [user?.id]
  )

  const handleSetInterested = useCallback(
    async (eventId: string, value: boolean): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeEventId(eventId)
      if (value) {
        setActions((prev) => ({
          ...prev,
          interestedIds: new Set(prev.interestedIds).add(key),
        }))
        const { error } = await setEventAction(user.id, eventId, 'interested')
        if (error) {
          setActions((prev) => {
            const next = new Set(prev.interestedIds)
            next.delete(key)
            return { ...prev, interestedIds: next }
          })
          return false
        }
      } else {
        setActions((prev) => {
          const next = new Set(prev.interestedIds)
          next.delete(key)
          return { ...prev, interestedIds: next }
        })
        const { error } = await removeEventAction(user.id, eventId, 'interested')
        if (error) {
          setActions((prev) => ({
            ...prev,
            interestedIds: new Set(prev.interestedIds).add(key),
          }))
          return false
        }
      }
      return true
    },
    [user?.id]
  )

  const handleSetReminder = useCallback(
    async (eventId: string, value: boolean, hoursBefore = 24): Promise<boolean> => {
      if (!user?.id) return false
      const key = normalizeEventId(eventId)
      if (value) {
        setActions((prev) => ({
          ...prev,
          reminderIds: new Set(prev.reminderIds).add(key),
        }))
        const { error } = await setEventAction(user.id, eventId, 'reminder', { reminder_hours_before: hoursBefore })
        if (error) {
          setActions((prev) => {
            const next = new Set(prev.reminderIds)
            next.delete(key)
            return { ...prev, reminderIds: next }
          })
          return false
        }
      } else {
        setActions((prev) => {
          const next = new Set(prev.reminderIds)
          next.delete(key)
          return { ...prev, reminderIds: next }
        })
        const { error } = await removeEventAction(user.id, eventId, 'reminder')
        if (error) {
          setActions((prev) => ({
            ...prev,
            reminderIds: new Set(prev.reminderIds).add(key),
          }))
          return false
        }
      }
      return true
    },
    [user?.id]
  )

  const value: UserActionsContextValue = {
    actions,
    loading,
    refetch,
    followVenue: handleFollowVenue,
    unfollowVenue: handleUnfollowVenue,
    isFollowingVenue: (id) => actions.followedVenueIds.has(normalizeId(id)),
    followPromoter: handleFollowPromoter,
    unfollowPromoter: handleUnfollowPromoter,
    isFollowingPromoter: (id) => actions.followedPromoterIds.has(normalizeId(id)),
    addToWishlist: handleAddToWishlist,
    removeFromWishlist: handleRemoveFromWishlist,
    isWishlisted: (id) => actions.wishlistedEventIds.has(normalizeEventId(id)),
    likeEvent: handleLikeEvent,
    unlikeEvent: handleUnlikeEvent,
    isLiked: (id) => actions.likedEventIds.has(normalizeEventId(id)),
    setGoing: handleSetGoing,
    setInterested: handleSetInterested,
    setReminder: handleSetReminder,
    isGoing: (id) => actions.goingIds.has(normalizeEventId(id)),
    isInterested: (id) => actions.interestedIds.has(id),
    hasReminder: (id) => actions.reminderIds.has(id),
  }

  return (
    <UserActionsContext.Provider value={value}>
      {children}
    </UserActionsContext.Provider>
  )
}
