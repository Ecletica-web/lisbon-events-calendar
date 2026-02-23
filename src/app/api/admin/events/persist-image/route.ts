import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'event-images'
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const FETCH_TIMEOUT_MS = 15000

function sanitizeEventId(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128) || 'event'
}

function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  return map[mime?.toLowerCase()] ?? 'jpg'
}

function checkAuth(request: NextRequest): boolean {
  const apiKey = process.env.EVENT_IMPORT_API_KEY
  if (!apiKey) return false
  const header = request.headers.get('x-api-key') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return header === apiKey
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!supabaseServer) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })
  }

  const contentType = request.headers.get('content-type') ?? ''

  try {
    let buffer: ArrayBuffer
    let ext = 'jpg'

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      const eventIdRaw = formData.get('eventId') ?? formData.get('event_id')
      const eventId = typeof eventIdRaw === 'string' ? eventIdRaw.trim() : ''

      if (!file || !eventId) {
        return NextResponse.json({ error: 'Missing file or eventId' }, { status: 400 })
      }
      const name = file.name.toLowerCase()
      ext = name.split('.').pop() ?? 'jpg'
      if (!ALLOWED_EXT.includes(ext)) ext = 'jpg'
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
      }
      buffer = await file.arrayBuffer()
      const path = `${sanitizeEventId(eventId)}.${ext}`
      const { data, error } = await supabaseServer.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const { data: urlData } = supabaseServer.storage.from(BUCKET).getPublicUrl(data.path)
      return NextResponse.json({ url: urlData.publicUrl, path: data.path })
    }

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}))
      const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
      const eventIdRaw = body.eventId ?? body.event_id ?? ''
      const eventId = typeof eventIdRaw === 'string' ? eventIdRaw.trim() : ''

      if (!imageUrl || !eventId) {
        return NextResponse.json({ error: 'Missing imageUrl or eventId' }, { status: 400 })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const res = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'LisbonEventsCalendar/1.0' },
      }).finally(() => clearTimeout(timeout))

      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch image: ${res.status}` }, { status: 400 })
      }
      const contentLength = res.headers.get('content-length')
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
        return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 })
      }
      buffer = await res.arrayBuffer()
      if (buffer.byteLength > MAX_SIZE) {
        return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 })
      }
      const mime = res.headers.get('content-type')?.split(';')[0] ?? ''
      ext = getExtFromMime(mime)
      const path = `${sanitizeEventId(eventId)}.${ext}`
      const { data, error } = await supabaseServer.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: mime || `image/${ext}`, upsert: true })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const { data: urlData } = supabaseServer.storage.from(BUCKET).getPublicUrl(data.path)
      return NextResponse.json({ url: urlData.publicUrl, path: data.path })
    }

    return NextResponse.json({ error: 'Use multipart/form-data (file + eventId) or JSON (imageUrl + eventId)' }, { status: 400 })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json({ error: 'Image fetch timed out' }, { status: 408 })
    }
    console.error('Persist image error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
