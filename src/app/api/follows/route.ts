import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import { getFollowsByUserId, createFollow, deleteFollow } from '@/lib/db'

// Get all follows for user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any)
    const userId = session?.user ? (session.user as any).id : null
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const follows = getFollowsByUserId(userId)
    return NextResponse.json({ follows })
  } catch (error) {
    console.error('Get follows error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Create a new follow
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any)
    const userId = session?.user ? (session.user as any).id : null
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { type, normalizedValue, displayValue } = await request.json()
    
    if (!type || !normalizedValue || !displayValue) {
      return NextResponse.json(
        { error: 'Type, normalizedValue, and displayValue are required' },
        { status: 400 }
      )
    }
    
    if (!['tag', 'venue', 'source', 'artist'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    
    const follow = createFollow(userId, type, normalizedValue, displayValue)
    
    return NextResponse.json({ follow })
  } catch (error) {
    console.error('Create follow error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Delete a follow
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any)
    const userId = session?.user ? (session.user as any).id : null
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }
    
    const deleted = deleteFollow(id, userId)
    
    if (!deleted) {
      return NextResponse.json({ error: 'Follow not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete follow error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
