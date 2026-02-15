/**
 * Share helpers for profile links and app invites
 */

export function getProfileShareUrl(userId: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/u/${userId}`
  }
  return `/u/${userId}`
}

export function getAppInviteMessage(): string {
  return 'Discover events in Lisbon — try the calendar:'
}

export function getAppUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

export function getFullInviteText(): string {
  return `${getAppInviteMessage()} ${getAppUrl()}`
}

/** Invite text when sharing your profile (invite to your calendar) */
export function getProfileInviteMessage(): string {
  return 'Invite friends to your calendar — here’s my profile:'
}

export function getFullProfileInviteText(profileUrl: string): string {
  return `${getProfileInviteMessage()} ${profileUrl}`
}

export function supportsShare(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.share
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
