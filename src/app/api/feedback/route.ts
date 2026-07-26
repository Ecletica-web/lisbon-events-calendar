import { NextRequest, NextResponse } from 'next/server'
import {
  createBugReport,
  parseCreateBugReportBody,
  resolveOptionalUser,
} from '@/lib/userBugReports'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_SHOT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const parsed = parseCreateBugReportBody({
    description: form.get('description'),
    pageUrl: form.get('pageUrl') ?? form.get('page_url'),
    userAgent: form.get('userAgent') ?? form.get('user_agent'),
    viewport: form.get('viewport'),
  })
  if (!parsed) {
    return NextResponse.json(
      { error: 'Description must be between 3 and 2000 characters' },
      { status: 400 }
    )
  }

  const file = form.get('screenshot')
  let screenshot: { buffer: Buffer; contentType: string } | null = null
  if (file instanceof File && file.size > 0) {
    const mime = (file.type || 'image/jpeg').toLowerCase()
    if (!ALLOWED_SHOT_TYPES.has(mime)) {
      return NextResponse.json({ error: 'Screenshot must be jpeg, png, or webp' }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    screenshot = { buffer, contentType: mime === 'image/jpg' ? 'image/jpeg' : mime }
  }

  const { user_id, user_email } = await resolveOptionalUser(getBearer(request))

  const { data, error } = await createBugReport({
    ...parsed,
    user_id,
    user_email,
    screenshot,
  })
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}
