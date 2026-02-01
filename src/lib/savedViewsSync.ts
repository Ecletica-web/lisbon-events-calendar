/**
 * Sync saved views between localStorage and database
 */

import { SavedView, getSavedViews, saveView } from './savedViews'
import { ViewState } from './viewState'

export interface DBSavedView {
  id: string
  name: string
  state: ViewState
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Import local views to database
 */
export async function importLocalViewsToDB(): Promise<number> {
  const localViews = getSavedViews()
  let imported = 0
  
  for (const view of localViews) {
    try {
      const response = await fetch('/api/saved-views', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: view.name,
          state: view.state,
        }),
      })
      
      if (response.ok) {
        imported++
      }
    } catch (error) {
      console.error('Error importing view:', error)
    }
  }
  
  return imported
}

/**
 * Load saved views from database
 */
export async function loadSavedViewsFromDB(): Promise<DBSavedView[]> {
  try {
    const response = await fetch('/api/saved-views')
    
    if (!response.ok) {
      throw new Error('Failed to load views')
    }
    
    const { views } = await response.json()
    return views.map((v: any) => ({
      id: v.id,
      name: v.name,
      state: JSON.parse(v.state_json),
      isDefault: v.is_default,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
    }))
  } catch (error) {
    console.error('Error loading views from DB:', error)
    return []
  }
}

/**
 * Save view to database
 */
export async function saveViewToDB(name: string, state: ViewState): Promise<DBSavedView | null> {
  try {
    const response = await fetch('/api/saved-views', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, state }),
    })
    
    if (!response.ok) {
      throw new Error('Failed to save view')
    }
    
    const { view } = await response.json()
    return {
      id: view.id,
      name: view.name,
      state: JSON.parse(view.state_json),
      isDefault: view.is_default,
      createdAt: view.created_at,
      updatedAt: view.updated_at,
    }
  } catch (error) {
    console.error('Error saving view to DB:', error)
    return null
  }
}
