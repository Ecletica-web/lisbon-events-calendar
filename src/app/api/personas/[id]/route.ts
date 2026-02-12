import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import { updatePersona, deletePersona } from '@/lib/db'
import type { PersonaRules } from '@/lib/db/schema'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await context.params
    const body = await request.json()
    const { title, slug, descriptionShort, rules, isPublic } = body
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (slug !== undefined) updates.slug = slug
    if (descriptionShort !== undefined) updates.description_short = descriptionShort
    if (rules !== undefined) updates.rules_json = JSON.stringify(rules as PersonaRules)
    if (isPublic !== undefined) updates.is_public = !!isPublic
    const persona = updatePersona(id, userId, updates as any)
    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }
    return NextResponse.json({ persona })
  } catch (error) {
    console.error('Update persona error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await context.params
    const deleted = deletePersona(id, userId)
    if (!deleted) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete persona error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
