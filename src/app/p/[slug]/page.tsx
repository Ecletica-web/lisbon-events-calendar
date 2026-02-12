'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { mergeViewState, personaRulesToViewState, serializeViewStateToURL } from '@/lib/viewState'
import type { PersonaRulesInput } from '@/lib/viewState'

export default function SharedPersonaPage() {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params.slug === 'string' ? params.slug : ''
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!FEATURE_FLAGS.SHARED_VIEWS || !FEATURE_FLAGS.PERSONAS) {
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
        const res = await fetch(`/api/personas/public/${slug}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || 'Persona not found')
          return
        }
        const { persona } = await res.json()
        const rulesJson = persona.rules_json
        const rules: PersonaRulesInput = typeof rulesJson === 'string' ? JSON.parse(rulesJson) : rulesJson
        const partial = personaRulesToViewState(rules)
        const state = mergeViewState(partial)
        const urlParams = serializeViewStateToURL(state)
        const qs = new URLSearchParams(urlParams)
        qs.set('sharedSlug', slug)
        if (persona.owner_name) qs.set('sharedBy', persona.owner_name)
        qs.set('sharedType', 'persona')
        if (persona.title) qs.set('sharedName', persona.title)
        router.replace(`/calendar?${qs.toString()}`)
      } catch (err) {
        console.error('Failed to load shared persona:', err)
        setError('Failed to load persona')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug, router])

  if (!FEATURE_FLAGS.SHARED_VIEWS || !FEATURE_FLAGS.PERSONAS) return null

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading persona...</div>
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
