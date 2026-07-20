import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getPipelinePostDetail, listPipelinePosts } from '@/lib/adminPipeline'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  try {
    if (id) {
      const detail = await getPipelinePostDetail(id)
      return NextResponse.json(detail)
    }
    const result = await listPipelinePosts({
      q: searchParams.get('q') || undefined,
      handle: searchParams.get('handle') || undefined,
      status: searchParams.get('status') || undefined,
      mediaType: searchParams.get('mediaType') || undefined,
      limit: Number(searchParams.get('limit') || 50),
      offset: Number(searchParams.get('offset') || 0),
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
