/**
 * Simple file-based database for MVP
 * In production, replace with proper database (PostgreSQL, etc.)
 */

import fs from 'fs'
import path from 'path'
import { SavedViewRow, FollowRow, NotificationSettingsRow, UserRow } from './schema'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_FILES = {
  users: path.join(DB_DIR, 'users.json'),
  savedViews: path.join(DB_DIR, 'saved_views.json'),
  follows: path.join(DB_DIR, 'follows.json'),
  notificationSettings: path.join(DB_DIR, 'notification_settings.json'),
}

// Ensure data directory exists
if (typeof window === 'undefined') {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }
  
  // Initialize empty files if they don't exist
  Object.values(DB_FILES).forEach((file) => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify([], null, 2))
    }
  })
}

function readFile<T>(file: string): T[] {
  try {
    const content = fs.readFileSync(file, 'utf-8')
    return JSON.parse(content) as T[]
  } catch {
    return []
  }
}

function writeFile<T>(file: string, data: T[]): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

// Users
export function getUserById(id: string): UserRow | null {
  const users = readFile<UserRow>(DB_FILES.users)
  return users.find((u) => u.id === id) || null
}

export function getUserByEmail(email: string): UserRow | null {
  const users = readFile<UserRow>(DB_FILES.users)
  return users.find((u) => u.email === email) || null
}

export function createUser(email: string, name?: string, passwordHash?: string): UserRow {
  const users = readFile<UserRow>(DB_FILES.users)
  const newUser: UserRow = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    email,
    name,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  users.push(newUser)
  writeFile(DB_FILES.users, users)
  return newUser
}

export function updateUserPassword(userId: string, passwordHash: string): boolean {
  const users = readFile<UserRow>(DB_FILES.users)
  const index = users.findIndex((u) => u.id === userId)
  
  if (index === -1) return false
  
  users[index].password_hash = passwordHash
  users[index].updated_at = new Date().toISOString()
  writeFile(DB_FILES.users, users)
  return true
}

// Saved Views
export function getSavedViewsByUserId(userId: string): SavedViewRow[] {
  const views = readFile<SavedViewRow>(DB_FILES.savedViews)
  return views.filter((v) => v.user_id === userId)
}

export function getSavedViewById(id: string, userId: string): SavedViewRow | null {
  const views = readFile<SavedViewRow>(DB_FILES.savedViews)
  return views.find((v) => v.id === id && v.user_id === userId) || null
}

export function createSavedView(
  userId: string,
  name: string,
  stateJson: string
): SavedViewRow {
  const views = readFile<SavedViewRow>(DB_FILES.savedViews)
  const newView: SavedViewRow = {
    id: `view-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    name,
    state_json: stateJson,
    is_default: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  views.push(newView)
  writeFile(DB_FILES.savedViews, views)
  return newView
}

export function updateSavedView(
  id: string,
  userId: string,
  updates: Partial<Pick<SavedViewRow, 'name' | 'state_json' | 'is_default'>>
): SavedViewRow | null {
  const views = readFile<SavedViewRow>(DB_FILES.savedViews)
  const index = views.findIndex((v) => v.id === id && v.user_id === userId)
  
  if (index === -1) return null
  
  views[index] = {
    ...views[index],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  
  writeFile(DB_FILES.savedViews, views)
  return views[index]
}

export function deleteSavedView(id: string, userId: string): boolean {
  const views = readFile<SavedViewRow>(DB_FILES.savedViews)
  const filtered = views.filter((v) => !(v.id === id && v.user_id === userId))
  
  if (filtered.length === views.length) return false
  
  writeFile(DB_FILES.savedViews, filtered)
  return true
}

export function setDefaultSavedView(id: string, userId: string): void {
  const views = readFile<SavedViewRow>(DB_FILES.savedViews)
  
  // Remove default flag from all user's views
  views.forEach((v) => {
    if (v.user_id === userId) {
      v.is_default = v.id === id
    }
  })
  
  writeFile(DB_FILES.savedViews, views)
}

// Follows
export function getFollowsByUserId(userId: string): FollowRow[] {
  const follows = readFile<FollowRow>(DB_FILES.follows)
  return follows.filter((f) => f.user_id === userId)
}

export function createFollow(
  userId: string,
  type: FollowRow['type'],
  normalizedValue: string,
  displayValue: string
): FollowRow {
  const follows = readFile<FollowRow>(DB_FILES.follows)
  
  // Check if already exists
  const existing = follows.find(
    (f) =>
      f.user_id === userId &&
      f.type === type &&
      f.normalized_value === normalizedValue
  )
  
  if (existing) return existing
  
  const newFollow: FollowRow = {
    id: `follow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    type,
    normalized_value: normalizedValue,
    display_value: displayValue,
    created_at: new Date().toISOString(),
  }
  
  follows.push(newFollow)
  writeFile(DB_FILES.follows, follows)
  return newFollow
}

export function deleteFollow(id: string, userId: string): boolean {
  const follows = readFile<FollowRow>(DB_FILES.follows)
  const filtered = follows.filter((f) => !(f.id === id && f.user_id === userId))
  
  if (filtered.length === follows.length) return false
  
  writeFile(DB_FILES.follows, filtered)
  return true
}

// Notification Settings
export function getNotificationSettings(userId: string): NotificationSettingsRow | null {
  const settings = readFile<NotificationSettingsRow>(DB_FILES.notificationSettings)
  return settings.find((s) => s.user_id === userId) || null
}

export function createOrUpdateNotificationSettings(
  userId: string,
  updates: Partial<Omit<NotificationSettingsRow, 'user_id' | 'updated_at'>>
): NotificationSettingsRow {
  const settings = readFile<NotificationSettingsRow>(DB_FILES.notificationSettings)
  const index = settings.findIndex((s) => s.user_id === userId)
  
  const defaultSettings: NotificationSettingsRow = {
    user_id: userId,
    email_enabled: false,
    digest_frequency: 'daily',
    instant_enabled: false,
    timezone: 'Europe/Lisbon',
    updated_at: new Date().toISOString(),
  }
  
  if (index === -1) {
    const newSettings: NotificationSettingsRow = {
      ...defaultSettings,
      ...updates,
      updated_at: new Date().toISOString(),
    }
    settings.push(newSettings)
    writeFile(DB_FILES.notificationSettings, settings)
    return newSettings
  } else {
    settings[index] = {
      ...settings[index],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    writeFile(DB_FILES.notificationSettings, settings)
    return settings[index]
  }
}
