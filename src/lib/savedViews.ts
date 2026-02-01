import { ViewState } from './viewState'

export interface SavedView {
  id: string
  name: string
  state: ViewState
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'lisbon-events-saved-views'
const DEFAULT_VIEW_KEY = 'lisbon-events-default-view-id'

/**
 * Get all saved views from localStorage
 */
export function getSavedViews(): SavedView[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error reading saved views:', error)
    return []
  }
}

/**
 * Save views to localStorage
 */
export function saveViews(views: SavedView[]): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
  } catch (error) {
    console.error('Error saving views:', error)
  }
}

/**
 * Get default view ID
 */
export function getDefaultViewId(): string | null {
  if (typeof window === 'undefined') return null
  
  try {
    return localStorage.getItem(DEFAULT_VIEW_KEY)
  } catch {
    return null
  }
}

/**
 * Set default view ID
 */
export function setDefaultViewId(id: string | null): void {
  if (typeof window === 'undefined') return
  
  try {
    if (id) {
      localStorage.setItem(DEFAULT_VIEW_KEY, id)
    } else {
      localStorage.removeItem(DEFAULT_VIEW_KEY)
    }
  } catch (error) {
    console.error('Error setting default view:', error)
  }
}

/**
 * Get default view
 */
export function getDefaultView(): SavedView | null {
  const defaultId = getDefaultViewId()
  if (!defaultId) return null
  
  const views = getSavedViews()
  return views.find((v) => v.id === defaultId) || null
}

/**
 * Save a new view
 */
export function saveView(name: string, state: ViewState): SavedView {
  const views = getSavedViews()
  const newView: SavedView = {
    id: `view-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    state,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  
  views.push(newView)
  saveViews(views)
  return newView
}

/**
 * Update an existing view
 */
export function updateView(id: string, updates: Partial<SavedView>): SavedView | null {
  const views = getSavedViews()
  const index = views.findIndex((v) => v.id === id)
  
  if (index === -1) return null
  
  views[index] = {
    ...views[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  
  saveViews(views)
  return views[index]
}

/**
 * Delete a view
 */
export function deleteView(id: string): boolean {
  const views = getSavedViews()
  const filtered = views.filter((v) => v.id !== id)
  
  if (filtered.length === views.length) return false
  
  saveViews(filtered)
  
  // If deleted view was default, clear default
  const defaultId = getDefaultViewId()
  if (defaultId === id) {
    setDefaultViewId(null)
  }
  
  return true
}

/**
 * Set a view as default
 */
export function setViewAsDefault(id: string): void {
  const views = getSavedViews()
  const view = views.find((v) => v.id === id)
  
  if (!view) return
  
  // Remove default flag from all views
  views.forEach((v) => {
    v.isDefault = v.id === id
  })
  
  saveViews(views)
  setDefaultViewId(id)
}
