'use client'

export type ReviewEditableFields = {
  description_short: string
  start_datetime: string
  venue_name_raw: string
  description_long: string
}

export type ReviewCardRow = {
  review_id: string
  source_event_id?: string
  description_short?: string
  description_long?: string
  start_datetime?: string
  venue_name_raw?: string
  validation_status?: string
  validation_reasons?: string
  verification_verdict?: string
  verification_notes?: string
  verification_sources?: string
  suggested_corrections?: string
  stored_image_url?: string
  thumbnail_url?: string
  owner_username?: string
  source_url?: string
  caption?: string
  review_status?: string
  confidence_score?: string
}

type Props = {
  row: ReviewCardRow
  edits: Partial<ReviewEditableFields>
  qualityRating: number
  notes: string
  busy: boolean
  canResolve: boolean
  onEdit: (field: keyof ReviewEditableFields, value: string) => void
  onQualityChange: (rating: number) => void
  onNotesChange: (notes: string) => void
  onApplySuggestions: () => void
  onApprove: () => void
  onReject: () => void
}

function fieldValue(
  edits: Partial<ReviewEditableFields>,
  row: ReviewCardRow,
  field: keyof ReviewEditableFields
): string {
  if (edits[field] != null) return edits[field]!
  return row[field] ?? ''
}

/** Editable review card: image + event fields + Tier 5 context + approve/reject. */
export function ReviewEventEditCard({
  row,
  edits,
  qualityRating,
  notes,
  busy,
  canResolve,
  onEdit,
  onQualityChange,
  onNotesChange,
  onApplySuggestions,
  onApprove,
  onReject,
}: Props) {
  const status = row.review_status || 'pending'
  const pending = status === 'pending'
  const imageUrl = row.stored_image_url || row.thumbnail_url

  return (
    <article className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 grid gap-4 md:grid-cols-[140px_1fr]">
      <div>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="w-full rounded object-cover aspect-square" />
        ) : (
          <div className="w-full aspect-square rounded bg-slate-900/80 border border-slate-700" />
        )}
        <p className="text-xs text-slate-500 mt-2">@{row.owner_username || '—'}</p>
        {row.source_url && (
          <a
            href={row.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400"
          >
            Source
          </a>
        )}
      </div>

      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">{status}</span>
          {row.validation_status && (
            <span className="px-2 py-0.5 rounded bg-amber-900/50 text-amber-200">
              {row.validation_status}
              {row.validation_reasons ? `: ${row.validation_reasons}` : ''}
            </span>
          )}
          {row.verification_verdict && (
            <span className="px-2 py-0.5 rounded bg-violet-900/50 text-violet-200">
              Tier5: {row.verification_verdict}
            </span>
          )}
          {row.confidence_score && (
            <span className="px-2 py-0.5 rounded bg-slate-700/80 text-slate-400">
              conf {row.confidence_score}
            </span>
          )}
        </div>

        {row.verification_notes && (
          <p className="text-xs text-slate-400 whitespace-pre-wrap">{row.verification_notes}</p>
        )}

        {row.suggested_corrections && (
          <div className="text-xs">
            {pending && canResolve && (
              <button
                type="button"
                className="text-indigo-400 underline"
                onClick={onApplySuggestions}
              >
                Apply Tier 5 suggestions
              </button>
            )}
            <pre className="mt-1 text-slate-500 overflow-auto max-h-20 whitespace-pre-wrap break-all">
              {row.suggested_corrections}
            </pre>
          </div>
        )}

        {row.caption && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer text-slate-400">Caption</summary>
            <p className="mt-1 whitespace-pre-wrap max-h-28 overflow-auto">{row.caption}</p>
          </details>
        )}

        <label className="block text-xs text-slate-400">
          Title
          <input
            className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
            value={fieldValue(edits, row, 'description_short')}
            onChange={(ev) => onEdit('description_short', ev.target.value)}
            disabled={!pending || !canResolve}
          />
        </label>

        <label className="block text-xs text-slate-400">
          Start datetime
          <input
            className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
            value={fieldValue(edits, row, 'start_datetime')}
            onChange={(ev) => onEdit('start_datetime', ev.target.value)}
            disabled={!pending || !canResolve}
          />
        </label>

        <label className="block text-xs text-slate-400">
          Venue
          <input
            className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
            value={fieldValue(edits, row, 'venue_name_raw')}
            onChange={(ev) => onEdit('venue_name_raw', ev.target.value)}
            disabled={!pending || !canResolve}
          />
        </label>

        <label className="block text-xs text-slate-400">
          Description
          <textarea
            rows={3}
            className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white resize-y"
            value={fieldValue(edits, row, 'description_long')}
            onChange={(ev) => onEdit('description_long', ev.target.value)}
            disabled={!pending || !canResolve}
          />
        </label>

        {pending && canResolve && (
          <>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="text-xs text-slate-400 flex items-center gap-2">
                Quality (1–10)
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={qualityRating}
                  onChange={(ev) => onQualityChange(Number(ev.target.value))}
                  className="w-28"
                />
                <span className="text-slate-300 w-5 tabular-nums">{qualityRating}</span>
              </label>
            </div>
            <label className="block text-xs text-slate-400">
              Review notes
              <input
                className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                value={notes}
                onChange={(ev) => onNotesChange(ev.target.value)}
                placeholder="Optional notes for learning / prompts"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={onApprove}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
              >
                Approve → Processed
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onReject}
                className="px-3 py-1.5 rounded bg-rose-700 text-white text-sm disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}
