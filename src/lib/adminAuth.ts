/**
 * Admin auth: Supabase session + ADMIN_EMAILS allowlist.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = getAdminEmails()
  if (allow.length === 0) return false
  return allow.includes(email.trim().toLowerCase())
}

function getBearer(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export type AdminAuthResult =
  | { ok: true; email: string; userId: string }
  | { ok: false; response: NextResponse }

/** Gate for /api/admin/* routes (except persist-image which uses EVENT_IMPORT_API_KEY). */
export async function requireAdmin(request: NextRequest): Promise<AdminAuthResult> {
  if (!supabaseServer) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Supabase not configured' }, { status: 503 }),
    }
  }

  const allow = getAdminEmails()
  if (allow.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ADMIN_EMAILS is not configured' },
        { status: 503 }
      ),
    }
  }

  const bearer = getBearer(request)
  if (!bearer) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const {
    data: { user },
    error,
  } = await supabaseServer.auth.getUser(bearer)
  if (error || !user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
    }
  }

  if (!isAdminEmail(user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, email: user.email, userId: user.id }
}
