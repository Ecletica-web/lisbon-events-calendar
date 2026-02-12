import { NextRequest, NextResponse } from 'next/server'
import { getPersonaByShareSlug } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug
    if (!slug) {
      return NextResponse.json({ error: 'Slug required' }, { status: 400 })
    }
    const persona = getPersonaByShareSlug(slug)
    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }
    return NextResponse.json({
      persona: {
        id: persona.id,
        title: persona.title,
        description_short: persona.description_short,
        rules_json: persona.rules_json,
        share_slug: persona.share_slug,
        owner_name: persona.owner_name,
      },
    })
  } catch (error) {
    console.error('Get public persona error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
