import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  fetchReviewCsvs,
  parseRawCsvText,
  parseNeedsReviewCsvText,
  parseProcessedCsvText,
} from '@/lib/adminEventReview'

export const dynamic = 'force-dynamic'

const FALLBACK_FILES = {
  raw: 'Testing - Events_Raw.csv',
  needsReview: 'Testing - Needs_Review.csv',
  processed: 'Testing - Processed Events.csv',
} as const

function tryReadFallback(cwd: string, filename: string): string | null {
  const path = join(cwd, filename)
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

export async function GET() {
  try {
    let result = await fetchReviewCsvs()
    const cwd = process.cwd()

    if (result.raw.length === 0) {
      const text = tryReadFallback(cwd, FALLBACK_FILES.raw)
      if (text) result = { ...result, raw: parseRawCsvText(text) }
    }
    if (result.needsReview.length === 0) {
      const text = tryReadFallback(cwd, FALLBACK_FILES.needsReview)
      if (text) result = { ...result, needsReview: parseNeedsReviewCsvText(text) }
    }
    if (result.processed.length === 0) {
      const text = tryReadFallback(cwd, FALLBACK_FILES.processed)
      if (text) result = { ...result, processed: parseProcessedCsvText(text) }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Event review fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
