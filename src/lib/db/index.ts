/**
 * Simple file-based database for MVP
 * In production, replace with proper database (PostgreSQL, etc.)
 */

import fs from 'fs'
import path from 'path'
import { SavedViewRow, FollowRow, NotificationSettingsRow, UserRow, PersonaRow } from './schema'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_FILES = {
  users: path.join(DB_DIR, 'users.json'),
  savedViews: path.join(DB_DIR, 'saved_views.json'),
  follows: path.join(DB_DIR, 'follows.json'),
  notificationSettings: path.join(DB_DIR, 'notification_settings.json'),
  personas: path.join(DB_DIR, 'personas.json'),
}

function generateShareSlug(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

// Migrate saved_views: add is_public, share_slug if missing
function migrateSavedViews(): void {
  try {
    const views = readFile<SavedViewRow & { is_public?: boolean; share_slug?: string }>(DB_FILES.savedViews)
    let changed = false
    for (const v of views) {
      if ((v as any).is_public === undefined) {
        ;(v as any).is_public = false
        changed = true
      }
      if (!(v as any).share_slug) {
        ;(v as any).share_slug = generateShareSlug()
        changed = true
      }
    }
    if (changed) writeFile(DB_FILES.savedViews, views as SavedViewRow[])
  } catch {
    // Ignore migration errors
  }
}

// Ensure data directory exists
if (typeof window === 'undefined') {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true })
    }
    
    // Initialize empty files if they don't exist
    Object.values(DB_FILES).forEach((file) => {
      try {
        if (!fs.existsSync(file)) {
          fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf-8')
        } else {
          try {
            const content = fs.readFileSync(file, 'utf-8')
            if (content.trim() === '') {
              fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf-8')
            } else {
              JSON.parse(content)
            }
          } catch {
            fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf-8')
          }
        }
      } catch (fileError) {
        console.error(`Error initializing database file ${file}:`, fileError)
      }
    })
    migrateSavedViews()
  } catch (error) {
    console.error('Error initializing database:', error)
  }
}

function readFile<T>(file: string): T[] {
  try {
    if (!fs.existsSync(file)) {
      return []
    }
    const content = fs.readFileSync(file, 'utf-8')
    if (!content || content.trim() === '') {
      return []
    }
    return JSON.parse(content) as T[]
  } catch (error) {
    console.error(`Error reading file ${file}:`, error)
    return []
  }
}

function writeFile<T>(file: string, data: T[]): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error(`Error writing file ${file}:`, error)
    throw error
  }
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
  stateJson: string,
  isPublic = false
): SavedViewRow {
  const views = readFile<SavedViewRow>(DB_FILES.savedViews)
  const newView: SavedViewRow = {
    id: `view-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    name,
    state_json: stateJson,
    is_default: false,
    is_public: isPublic,
    share_slug: generateShareSlug(),
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
  updates: Partial<Pick<SavedViewRow, 'name' | 'state_json' | 'is_default' | 'is_public'>>
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

export function getSavedViewByShareSlug(shareSlug: string): (SavedViewRow & { owner_name?: string }) | null {
  const views = readFile<SavedViewRow & { is_public?: boolean; share_slug?: string }>(DB_FILES.savedViews)
  const view = views.find((v) => v.is_public === true && v.share_slug === shareSlug) || null
  if (!view) return null
  const users = readFile<UserRow>(DB_FILES.users)
  const owner = users.find((u) => u.id === view.user_id)
  return { ...view, owner_name: owner?.name || owner?.email }
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

// Personas
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `p${Date.now().toString(36)}`
}

export function getPersonasByUserId(userId: string): PersonaRow[] {
  const personas = readFile<PersonaRow>(DB_FILES.personas)
  return personas.filter((p) => p.owner_user_id === userId)
}

export function getPersonaById(id: string, userId: string): PersonaRow | null {
  const personas = readFile<PersonaRow>(DB_FILES.personas)
  return personas.find((p) => p.id === id && p.owner_user_id === userId) || null
}

export function createPersona(
  userId: string,
  title: string,
  rulesJson: string,
  descriptionShort?: string,
  isPublic = false
): PersonaRow {
  const personas = readFile<PersonaRow>(DB_FILES.personas)
  const baseSlug = slugify(title)
  let slug = baseSlug
  let i = 0
  while (personas.some((p) => p.owner_user_id === userId && p.slug === slug)) {
    slug = `${baseSlug}-${++i}`
  }
  const newPersona: PersonaRow = {
    id: `persona-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    owner_user_id: userId,
    title,
    slug,
    description_short: descriptionShort,
    rules_json: rulesJson,
    is_public: isPublic,
    share_slug: generateShareSlug().replace(/^s/, 'p'),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  personas.push(newPersona)
  writeFile(DB_FILES.personas, personas)
  return newPersona
}

export function updatePersona(
  id: string,
  userId: string,
  updates: Partial<Pick<PersonaRow, 'title' | 'slug' | 'description_short' | 'rules_json' | 'is_public'>>
): PersonaRow | null {
  const personas = readFile<PersonaRow>(DB_FILES.personas)
  const index = personas.findIndex((p) => p.id === id && p.owner_user_id === userId)
  if (index === -1) return null
  personas[index] = { ...personas[index], ...updates, updated_at: new Date().toISOString() }
  writeFile(DB_FILES.personas, personas)
  return personas[index]
}

export function deletePersona(id: string, userId: string): boolean {
  const personas = readFile<PersonaRow>(DB_FILES.personas)
  const filtered = personas.filter((p) => !(p.id === id && p.owner_user_id === userId))
  if (filtered.length === personas.length) return false
  writeFile(DB_FILES.personas, filtered)
  return true
}

export function getPersonaByShareSlug(shareSlug: string): (PersonaRow & { owner_name?: string }) | null {
  const personas = readFile<PersonaRow>(DB_FILES.personas)
  const persona = personas.find((p) => p.is_public && p.share_slug === shareSlug) || null
  if (!persona) return null
  const users = readFile<UserRow>(DB_FILES.users)
  const owner = users.find((u) => u.id === persona.owner_user_id)
  return { ...persona, owner_name: owner?.name || owner?.email }
}

export function getPublicPersonasByUserId(userId: string): PersonaRow[] {
  const personas = readFile<PersonaRow>(DB_FILES.personas)
  return personas.filter((p) => p.owner_user_id === userId && p.is_public)
}

export function getPublicSavedViewsByUserId(userId: string): SavedViewRow[] {
  const views = readFile<SavedViewRow & { is_public?: boolean }>(DB_FILES.savedViews)
  return views.filter((v) => v.user_id === userId && v.is_public === true)
}

// Notification Settings
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
