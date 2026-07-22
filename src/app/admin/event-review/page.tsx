'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ReviewEventEditCard,
  type ReviewCardRow,
  type ReviewEditableFields,
} from '@/components/admin/ReviewEventEditCard'
import { useAdminAuthHeaders } from '@/lib/useAdminAuth'

const EDIT_FIELDS: (keyof ReviewEditableFields)[] = [
  'description_short',
  'start_datetime',
  'venue_name_raw',
  'description_long',
]

type CardState = {
  edits: Partial<ReviewEditableFields>
  quality: number
  notes: string
}

function emptyState(): CardState {
  return { edits: {}, quality: 7, notes: '' }
}

/** Build field_corrections for ML: corrected values + `__from` originals when changed. */
function buildFieldCorrections(
  row: ReviewCardRow,
  edits: Partial<ReviewEditableFields>
): Record<string, string> {
  const corrections: Record<string, string> = {}
  for (const field of EDIT_FIELDS) {
    const from = row[field] ?? ''
    const to = edits[field] ?? from
    if (String(to) !== String(from)) {
      corrections[field] = String(to)
      corrections[`${field}__from`] = String(from)
    }
  }
  return corrections
}

function effectiveEdits(
  row: ReviewCardRow,
  edits: Partial<ReviewEditableFields>
): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const field of EDIT_FIELDS) {
    if (edits[field] != null && edits[field] !== (row[field] ?? '')) {
      out[field] = edits[field]!
    }
  }
  return Object.keys(out).length ? out : undefined
}

function parseSuggestions(raw: string | undefined): Partial<ReviewEditableFields> {
  if (!raw) return {}
  try {
    const s = JSON.parse(raw) as Record<string, string>
    const next: Partial<ReviewEditableFields> = {}
    if (s.title) next.description_short = s.title
    if (s.description_short) next.description_short = s.description_short
    if (s.start_datetime) next.start_datetime = s.start_datetime
    if (s.venue_name_raw) next.venue_name_raw = s.venue_name_raw
    else if (s.venue_name) next.venue_name_raw = s.venue_name
    else if (s.venue) next.venue_name_raw = s.venue
    if (s.description_long) next.description_long = s.description_long
    return next
  } catch {
    return {}
  }
}

export default function AdminEventReviewPage() {
  const { getAuthHeaders, isAdmin } = useAdminAuthHeaders()
  const [rows, setRows] = useState<ReviewCardRow[]>([])
  const [source, setSource] = useState<'supabase' | 'sheets'>('supabase')
  const [sheetsWriteMode, setSheetsWriteMode] = useState<'auto' | 'manual'>('manual')
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [cardState, setCardState] = useState<Record<string, CardState>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [lastProcessedRow, setLastProcessedRow] = useState<Record<string, string> | null>(null)

  const load = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/admin/pipeline/review?status=${filter}`, { headers })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(j.error || 'Load failed')
      return
    }
    setRows((j.rows || []) as ReviewCardRow[])
    setSource(j.source === 'sheets' ? 'sheets' : 'supabase')
    setSheetsWriteMode(j.sheetsWriteMode === 'auto' ? 'auto' : 'manual')
    setMessage(
      j.source === 'sheets'
        ? 'Showing Needs_Review sheet (Supabase review queue empty). Approve/reject requires Supabase items.'
        : j.sheetsWriteMode === 'manual'
          ? 'Sheets auto-write is off — Approve marks the item done; paste into Processed Events / Events Clean New yourself.'
          : null
    )
  }, [getAuthHeaders, filter])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  function stateFor(id: string): CardState {
    return cardState[id] || emptyState()
  }

  function patchCard(id: string, patch: Partial<CardState>) {
    setCardState((prev) => ({
      ...prev,
      [id]: { ...emptyState(), ...prev[id], ...patch },
    }))
  }

  function setEdit(id: string, field: keyof ReviewEditableFields, value: string) {
    setCardState((prev) => {
      const cur = prev[id] || emptyState()
      return {
        ...prev,
        [id]: { ...cur, edits: { ...cur.edits, [field]: value } },
      }
    })
  }

  async function resolve(row: ReviewCardRow, action: 'approved' | 'rejected') {
    if (source === 'sheets') {
      setMessage('Approve/reject only works on Supabase review queue items (run the pipeline worker).')
      return
    }
    const id = row.review_id
    const state = stateFor(id)
    setBusy(id)
    setMessage(null)
    try {
      const headers = await getAuthHeaders()
      const fieldEdits = effectiveEdits(row, state.edits)
      const fieldCorrections = buildFieldCorrections(row, state.edits)

      // Persist corrections for learning before queue fields are overwritten
      await fetch('/api/admin/event-review/feedback', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: id,
          dataset: 'needsReview',
          source_event_id: row.source_event_id || undefined,
          quality_rating:
            action === 'approved' ? state.quality : Math.min(state.quality, 4),
          notes:
            state.notes ||
            (action === 'approved' ? 'Approved from admin' : 'Rejected from admin'),
          field_corrections: Object.keys(fieldCorrections).length
            ? fieldCorrections
            : undefined,
        }),
      }).catch(() => null)

      const res = await fetch('/api/admin/pipeline/review', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: id,
          action,
          fieldEdits,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')

      setMessage(
        action === 'approved'
          ? j.processedAppended
            ? 'Approved and appended to Processed Events + Events Clean New'
            : j.message ||
              'Approved. Copy the processed row into Processed Events / Events Clean New, then republish the CSV.'
          : 'Rejected'
      )
      if (action === 'approved' && j.processedRow) {
        setLastProcessedRow(j.processedRow as Record<string, string>)
      }
      setCardState((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  const canResolve = source === 'supabase'

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Edit title, datetime, venue, and description on each card. Corrections are saved to{' '}
        <code className="text-slate-300">event_review_feedback</code> for later learning.
        {source === 'sheets' ? ' Sheet fallback.' : ' Supabase queue.'}{' '}
        {sheetsWriteMode === 'manual'
          ? 'Processed Events / Events Clean New are edited manually — Approve does not auto-append.'
          : 'Approve appends to Processed Events and Events Clean New (live calendar).'}
      </p>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-sm ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} className="text-sm text-indigo-400">
          Refresh
        </button>
      </div>

      {message && (
        <p className="text-sm text-indigo-300 bg-indigo-950/40 border border-indigo-800 rounded px-3 py-2">
          {message}
        </p>
      )}

      {lastProcessedRow && (
        <div className="rounded border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-300">Last approved row (paste into Sheets if needed)</p>
            <button
              type="button"
              className="text-xs text-indigo-400"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(lastProcessedRow, null, 2))
                setMessage('Copied processed row JSON to clipboard')
              }}
            >
              Copy JSON
            </button>
          </div>
          <pre className="text-xs text-slate-400 overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {JSON.stringify(lastProcessedRow, null, 2)}
          </pre>
        </div>
      )}

      <p className="text-xs text-slate-500">{rows.length} event(s)</p>

      {rows.length === 0 && <p className="text-slate-500 text-sm">No items ready to review.</p>}

      <div className="space-y-4">
        {rows.map((row) => {
          const state = stateFor(row.review_id)
          return (
            <ReviewEventEditCard
              key={row.review_id}
              row={row}
              edits={state.edits}
              qualityRating={state.quality}
              notes={state.notes}
              busy={busy === row.review_id}
              canResolve={canResolve}
              onEdit={(field, value) => setEdit(row.review_id, field, value)}
              onQualityChange={(rating) => patchCard(row.review_id, { quality: rating })}
              onNotesChange={(n) => patchCard(row.review_id, { notes: n })}
              onApplySuggestions={() =>
                patchCard(row.review_id, {
                  edits: {
                    ...state.edits,
                    ...parseSuggestions(row.suggested_corrections),
                  },
                })
              }
              onApprove={() => void resolve(row, 'approved')}
              onReject={() => void resolve(row, 'rejected')}
            />
          )
        })}
      </div>
    </div>
  )
}
