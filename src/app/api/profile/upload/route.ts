import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!supabaseServer) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(bearer)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null // 'avatar' | 'cover'

    if (!file || !type || !['avatar', 'cover'].includes(type)) {
      return NextResponse.json({ error: 'Invalid file or type (avatar/cover)' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: 'Allowed formats: jpg, png, gif, webp' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })
    }

    const path = `${user.id}/${type}-${Date.now()}.${ext}`

    const { data, error } = await supabaseServer.storage
      .from('profile-images')
      .upload(path, file, { upsert: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: urlData } = supabaseServer.storage
      .from('profile-images')
      .getPublicUrl(data.path)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (e) {
    console.error('Profile upload error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
