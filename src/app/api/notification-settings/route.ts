import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import {
  getNotificationSettings,
  createOrUpdateNotificationSettings,
} from '@/lib/db'

// Get notification settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any) as any
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (userId === 'guest') {
      return NextResponse.json({
        settings: {
          email_enabled: false,
          digest_frequency: 'weekly',
          instant_enabled: false,
          timezone: 'Europe/Lisbon',
        },
      })
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
    const session = await getServerSession(authOptions as any) as any
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (userId === 'guest') {
      return NextResponse.json({ error: 'Guest cannot save data.' }, { status: 403 })
    }
    
    const updates = await request.json()
    
    const settings = createOrUpdateNotificationSettings(userId, updates)
    
    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Update notification settings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
