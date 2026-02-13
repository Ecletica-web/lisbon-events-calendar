/**
 * Resolve userId from NextAuth session or Supabase Bearer token.
 * Used by APIs that support both auth systems.
 */
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import { supabaseServer } from '@/lib/supabase/server'

export async function resolveUserId(request: Request): Promise<{ userId: string | null; isGuest: boolean }> {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (bearer && supabaseServer) {
    const { data: { user }, error } = await supabaseServer.auth.getUser(bearer)
    if (!error && user) {
      return { userId: user.id, isGuest: false }
    }
  }

  const session = (await getServerSession(authOptions as any)) as any
  const userId = session?.user?.id ?? null
  const isGuest = userId === 'guest'
  return { userId: isGuest ? null : userId, isGuest }
}
