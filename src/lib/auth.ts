/**
 * Simple client-side auth utilities
 * For MVP, we store user ID in localStorage
 * In production, use proper session management
 */

const USER_STORAGE_KEY = 'lisbon-events-user'

export interface User {
  id: string
  email: string
  name?: string
}

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored) as User
  } catch {
    return null
  }
}

export function setCurrentUser(user: User): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } catch (error) {
    console.error('Error saving user:', error)
  }
}

export function clearCurrentUser(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(USER_STORAGE_KEY)
  } catch (error) {
    console.error('Error clearing user:', error)
  }
}

export async function login(email: string, name?: string): Promise<User> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  })
  
  if (!response.ok) {
    throw new Error('Login failed')
  }
  
  const { user } = await response.json()
  setCurrentUser(user)
  return user
}

export async function logout(): Promise<void> {
  clearCurrentUser()
}
