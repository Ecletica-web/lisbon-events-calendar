# Friends vs Follows — Clear Distinction

## Summary

- **Friends** = Mutual relationship (friend request → accept). Friends see each other's going/saved/attended events.
- **Follow venues + promoters** = Private preference for event discovery. Not social — just "I want to see events from these venues/promoters."
- **No user followers** — Users do not have followers or following. You either are friends (mutual) or not.

---

## Friends (mutual, social)

- Stored in `friend_requests` table (status = `accepted` means mutual friends).
- Users send friend requests; the other user accepts or rejects.
- **Visibility:** Friends can see:
  - Events you're going to
  - Events you've been to (attended)
  - Events you saved (if visibility allows)
- Used for: "3 friends going" on event cards, For You recommendations, profile events visibility.

---

## Follow venues + promoters (private, curation)

- Stored in `user_follow_venues` and `user_follow_promoters` (Supabase).
- One-way: you follow a venue or promoter to get their events in your feed.
- **Private:** No one else sees who you follow. Used only for:
  - Event discovery (For You, followed venues/promoters events)
  - Your profile page (followed venues/promoters sections)
- Not a social graph — just personal preferences.

---

## What was removed

- **User-to-user follows** (asymmetric: followers/following) — removed. The `follows` table (follower_id, following_id) and all related UI/APIs have been removed. Users no longer have "followers" or "following"; they have **friends** only.
