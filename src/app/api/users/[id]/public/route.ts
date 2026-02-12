import { NextRequest, NextResponse } from 'next/server'
import { getUserById, getPublicSavedViewsByUserId, getPublicPersonasByUserId } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const user = getUserById(userId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const publicViews = getPublicSavedViewsByUserId(userId)
    const publicPersonas = getPublicPersonasByUserId(userId)

    return NextResponse.json({
      userId: user.id,
      userName: user.name || user.email,
      publicViews: publicViews.map((v) => ({
        id: v.id,
        name: v.name,
        share_slug: v.share_slug,
      })),
      publicPersonas: publicPersonas.map((p) => ({
        id: p.id,
        title: p.title,
        share_slug: p.share_slug,
      })),
    })
  } catch (error) {
    console.error('Get public profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
