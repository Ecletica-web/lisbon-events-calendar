'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { mergeViewState, serializeViewStateToURL } from '@/lib/viewState'
import type { ViewState } from '@/lib/viewState'

export default function SharedViewPage() {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params.slug === 'string' ? params.slug : ''
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!FEATURE_FLAGS.SHARED_VIEWS) {
      router.replace('/')
      return
    }
    if (!slug) {
      setError('Invalid link')
      setLoading(false)
      return
    }

    async function load() {
      try {
        const res = await fetch(`/api/saved-views/public/${slug}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || 'View not found')
          return
        }
        const { view } = await res.json()
        const stateJson = view.state_json
        const partial = typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson
        const state = mergeViewState(partial as Partial<ViewState>)
        const urlParams = serializeViewStateToURL(state)
        const qs = new URLSearchParams(urlParams)
        qs.set('sharedSlug', slug)
        if (view.owner_name) qs.set('sharedBy', view.owner_name)
        qs.set('sharedType', 'view')
        if (view.name) qs.set('sharedName', view.name)
        router.replace(`/calendar?${qs.toString()}`)
      } catch (err) {
        console.error('Failed to load shared view:', err)
        setError('Failed to load view')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug, router])

  if (!FEATURE_FLAGS.SHARED_VIEWS) return null

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading shared view...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-slate-300">{error}</p>
        <Link href="/calendar" className="text-indigo-400 hover:underline">
          Go to Calendar
        </Link>
      </div>
    )
  }

  return null
}
