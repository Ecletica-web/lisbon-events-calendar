/**
 * NextAuth session utilities
 * Use this alongside the existing auth.ts for migration
 */

import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function getServerSideSession() {
  return await getServerSession(authOptions)
}

// Re-export authOptions for use in API routes
export { authOptions }
