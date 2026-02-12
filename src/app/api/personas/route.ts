import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import { getPersonasByUserId, createPersona } from '@/lib/db'
import type { PersonaRules } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (userId === 'guest') {
      return NextResponse.json({ personas: [] })
    }
    const personas = getPersonasByUserId(userId)
    return NextResponse.json({ personas })
  } catch (error) {
    console.error('Get personas error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (userId === 'guest') {
      return NextResponse.json({ error: 'Guest cannot save data. Sign in to create personas.' }, { status: 403 })
    }
    const body = await request.json()
    const { title, descriptionShort, rules, isPublic } = body
    if (!title || !rules) {
      return NextResponse.json({ error: 'Title and rules are required' }, { status: 400 })
    }
    const rulesJson = JSON.stringify(rules as PersonaRules)
    const persona = createPersona(userId, title, rulesJson, descriptionShort, !!isPublic)
    return NextResponse.json({ persona })
  } catch (error) {
    console.error('Create persona error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
