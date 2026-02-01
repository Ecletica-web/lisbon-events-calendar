import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import {
  getSavedViewsByUserId,
  createSavedView,
  updateSavedView,
  deleteSavedView,
  setDefaultSavedView,
} from '@/lib/db'
import { ViewState } from '@/lib/viewState'

// Get all saved views for user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any) as any
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const views = getSavedViewsByUserId(userId)
    return NextResponse.json({ views })
  } catch (error) {
    console.error('Get saved views error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Create a new saved view
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any) as any
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { name, state } = await request.json()
    
    if (!name || !state) {
      return NextResponse.json({ error: 'Name and state are required' }, { status: 400 })
    }
    
    const stateJson = JSON.stringify(state as ViewState)
    const view = createSavedView(userId, name, stateJson)
    
    return NextResponse.json({ view })
  } catch (error) {
    console.error('Create saved view error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Update a saved view
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any) as any
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { id, name, state, isDefault } = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }
    
    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (state !== undefined) updates.state_json = JSON.stringify(state)
    if (isDefault !== undefined) {
      updates.is_default = isDefault
      if (isDefault) {
        setDefaultSavedView(id, userId)
      }
    }
    
    const view = updateSavedView(id, userId, updates)
    
    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 })
    }
    
    return NextResponse.json({ view })
  } catch (error) {
    console.error('Update saved view error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Delete a saved view
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any) as any
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }
    
    const deleted = deleteSavedView(id, userId)
    
    if (!deleted) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete saved view error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
