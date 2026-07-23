/**
 * Promoters API — CSV + Fontes IG split, server-side (no CORS).
 */

import { NextResponse } from 'next/server'
import { loadPromotersForDisplay } from '@/lib/catalogLoaders'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const promoters = await loadPromotersForDisplay()
    return NextResponse.json(promoters)
  } catch (err) {
    console.error('[api/promoters]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load promoters' },
      { status: 500 }
    )
  }
}
