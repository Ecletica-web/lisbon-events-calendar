import { NextRequest, NextResponse } from 'next/server'
import { getSavedViewByShareSlug } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug
    if (!slug) {
      return NextResponse.json({ error: 'Slug required' }, { status: 400 })
    }
    const view = getSavedViewByShareSlug(slug)
    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 })
    }
    return NextResponse.json({
      view: {
        id: view.id,
        name: view.name,
        state_json: view.state_json,
        share_slug: view.share_slug,
        owner_name: view.owner_name,
      },
    })
  } catch (error) {
    console.error('Get public saved view error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
