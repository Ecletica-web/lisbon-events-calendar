'use client'

import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
