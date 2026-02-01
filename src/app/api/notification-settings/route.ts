import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-config'
import {
  getNotificationSettings,
  createOrUpdateNotificationSettings,
} from '@/lib/db'

// Get notification settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    let settings = getNotificationSettings(userId)
    
    // Create default settings if none exist
    if (!settings) {
      settings = createOrUpdateNotificationSettings(userId, {})
    }
    
    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Get notification settings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Update notification settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const updates = await request.json()
    
    const settings = createOrUpdateNotificationSettings(userId, updates)
    
    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Update notification settings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
