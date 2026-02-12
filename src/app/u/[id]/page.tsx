'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FEATURE_FLAGS } from '@/lib/featureFlags'

interface PublicProfileData {
  userId: string
  userName?: string
  publicViews: { id: string; name: string; share_slug: string }[]
  publicPersonas: { id: string; title: string; share_slug: string }[]
}

export default function PublicProfilePage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const [data, setData] = useState<PublicProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!FEATURE_FLAGS.SHARED_VIEWS || !id) {
      setLoading(false)
      if (!id) setError('Invalid profile')
      return
    }

    async function load() {
      try {
        const res = await fetch(`/api/users/${id}/public`)
        if (!res.ok) {
          setError('Profile not found')
          return
        }
        const json = await res.json()
        setData(json)
      } catch {
        setError('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (!FEATURE_FLAGS.SHARED_VIEWS) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Link href="/" className="text-indigo-400 hover:underline">Go home</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-slate-300">{error || 'Not found'}</p>
        <Link href="/" className="text-indigo-400 hover:underline">Go home</Link>
      </div>
    )
  }

  const displayName = data.userName || data.userId

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-2xl mx-auto p-6 pt-24">
        <h1 className="text-2xl font-bold mb-2">@{displayName}</h1>
        <p className="text-slate-400 text-sm mb-8">Public views and personas</p>

        {data.publicViews.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Shared Views</h2>
            <ul className="space-y-2">
              {data.publicViews.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/v/${v.share_slug}`}
                    className="block p-3 rounded-lg border border-slate-700 hover:border-indigo-500 hover:bg-slate-800/50 transition-colors"
                  >
                    {v.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.publicPersonas.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Personas</h2>
            <ul className="space-y-2">
              {data.publicPersonas.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/p/${p.share_slug}`}
                    className="block p-3 rounded-lg border border-slate-700 hover:border-indigo-500 hover:bg-slate-800/50 transition-colors"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.publicViews.length === 0 && data.publicPersonas.length === 0 && (
          <p className="text-slate-500">No public views or personas yet.</p>
        )}

        <div className="mt-8">
          <Link href="/calendar" className="text-indigo-400 hover:underline">
            ← Back to Calendar
          </Link>
        </div>
      </div>
    </div>
  )
}
