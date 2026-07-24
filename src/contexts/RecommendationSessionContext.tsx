'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { RecommendationItemMeta } from '@/lib/recommendationTelemetryClient'

export type RecommendationSessionValue = {
  sessionId: string | null
  algorithmVersion: string
  telemetryEnabled: boolean
  itemsByEventId: Map<string, RecommendationItemMeta>
}

const RecommendationSessionContext = createContext<RecommendationSessionValue | null>(null)

export function RecommendationSessionProvider({
  value,
  children,
}: {
  value: RecommendationSessionValue
  children: ReactNode
}) {
  return (
    <RecommendationSessionContext.Provider value={value}>
      {children}
    </RecommendationSessionContext.Provider>
  )
}

export function useRecommendationSession(): RecommendationSessionValue | null {
  return useContext(RecommendationSessionContext)
}
