'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const supabase = useSupabaseAuth()
  const user = supabase?.user ?? session?.user

  useEffect(() => {
    if (status === 'loading') return
    if (!user) {
      router.replace('/login')
    }
  }, [user, status, router])

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-8">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white text-sm">← Back</Link>
          <h1 className="text-xl font-semibold text-white">Admin</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
