import { NextRequest, NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/resolveUserId'
import { getPersonasByUserId, createPersona } from '@/lib/db'
import type { PersonaRules } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  try {
    const { userId, isGuest } = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (isGuest) {
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
  let userId: string | null = null
  let isGuest = false
  try {
    const resolved = await resolveUserId(request)
    userId = resolved.userId
    isGuest = resolved.isGuest
  } catch (authError) {
    console.error('Create persona auth error:', authError)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (isGuest) {
    return NextResponse.json({ error: 'Guest cannot save data. Sign in to create personas.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { title, descriptionShort, rules, isPublic } = body
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (rules === undefined || rules === null) {
    return NextResponse.json({ error: 'Rules are required' }, { status: 400 })
  }
  if (typeof rules !== 'object' || Array.isArray(rules)) {
    return NextResponse.json({ error: 'Rules must be an object' }, { status: 400 })
  }

  let rulesJson: string
  try {
    rulesJson = JSON.stringify(rules as PersonaRules)
  } catch {
    return NextResponse.json({ error: 'Invalid rules format' }, { status: 400 })
  }

  try {
    const persona = createPersona(userId, title.trim(), rulesJson, descriptionShort as string | undefined, !!isPublic)
    return NextResponse.json({ persona })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Create persona error:', err.message, err)
    const isFileError = err.message?.includes('ENOENT') || err.message?.includes('EACCES') || err.message?.includes('EPERM')
    return NextResponse.json(
      { error: isFileError ? 'Unable to save persona. Storage may be read-only or unavailable.' : 'Internal server error' },
      { status: 500 }
    )
  }
}
