'use client'

import { useEffect, useState, useCallback } from 'react'
import Papa from 'papaparse'
import type { ReviewEventItem } from '@/lib/adminEventReview'
import { getCategoryColor } from '@/lib/categoryColors'

type TabId = 'raw' | 'needsReview' | 'processed'

const TAB_LABELS: Record<TabId, string> = {
  raw: 'Events Raw',
  needsReview: 'Needs Review',
  processed: 'Processed Events',
}

interface ReviewState {
  quality: number
  notes: string
}

function ReviewEventCard({
  item,
  review,
  onReviewChange,
}: {
  item: ReviewEventItem
  review: ReviewState | undefined
  onReviewChange: (id: string, quality: number, notes: string) => void
}) {
  const quality = review?.quality ?? 0
  const notes = review?.notes ?? ''
  const startDate = item.start ? new Date(item.start) : null
  const categoryColor = getCategoryColor(item.category)
  const descriptionText = item.descriptionLong?.trim()

  return (
    <article className="group rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-indigo-500/5 hover:border-slate-600 transition-all duration-300">
      <div className="aspect-[4/3] relative bg-slate-800 overflow-hidden">
        <img
          src={item.imageUrl || '/lisboa.png'}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => { e.currentTarget.src = '/lisboa.png' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        {item.validationStatus && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-600/90 text-white backdrop-blur-sm">
              {item.validationStatus}
            </span>
          </div>
        )}
        <div className="absolute bottom-3 left-3 right-3">
          <h2 className="font-bold text-white text-lg sm:text-xl line-clamp-2 drop-shadow-lg">{item.title}</h2>
          <p className="text-slate-200/90 text-sm sm:text-base mt-0.5 truncate">{item.venueName || 'TBA'}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5 min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base sm:text-sm mb-3">
          {startDate && (
            <time dateTime={item.start} className="text-slate-400 font-medium tabular-nums">
              {startDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
          {(item.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                  style={{ borderColor: categoryColor, color: categoryColor }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        {descriptionText && (
          <p className="text-slate-300 text-base sm:text-sm leading-relaxed line-clamp-4 mb-4">
            {descriptionText}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-slate-400 text-sm">Quality (1–10):</span>
          <select
            value={quality}
            onChange={(e) => onReviewChange(item.id, Number(e.target.value), notes)}
            className="rounded-lg px-2 py-1 bg-slate-700 border border-slate-600 text-slate-200 text-sm"
          >
            <option value={0}>—</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => onReviewChange(item.id, quality, e.target.value)}
            placeholder="e.g. wrong venue, missing date..."
            rows={2}
            className="w-full rounded-lg px-3 py-2 bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 text-sm resize-none"
          />
        </div>
      </div>
    </article>
  )
}

export default function EventReviewPage() {
  const [activeTab, setActiveTab] = useState<TabId>('raw')
  const [raw, setRaw] = useState<ReviewEventItem[]>([])
  const [needsReview, setNeedsReview] = useState<ReviewEventItem[]>([])
  const [processed, setProcessed] = useState<ReviewEventItem[]>([])
  const [reviewsById, setReviewsById] = useState<Record<string, ReviewState>>({})
  const [loading, setLoading] = useState(true)
  const [uploadingTab, setUploadingTab] = useState<TabId | null>(null)

  const loadFromApi = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/event-review')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setRaw(data.raw ?? [])
      setNeedsReview(data.needsReview ?? [])
      setProcessed(data.processed ?? [])
    } catch {
      setRaw([])
      setNeedsReview([])
      setProcessed([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFromApi()
  }, [loadFromApi])

  const handleReviewChange = useCallback((id: string, quality: number, notes: string) => {
    setReviewsById((prev) => ({
      ...prev,
      [id]: { quality, notes },
    }))
  }, [])

  const handleFileUpload = useCallback((tab: TabId, file: File) => {
    const reader = new FileReader()
    setUploadingTab(tab)
    reader.onload = () => {
      const text = String(reader.result ?? '')
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const rows = result.data ?? []
          const map = tab === 'raw' ? (r: Record<string, string>) => ({
            id: (r.id || String(Math.random())).trim(),
            imageUrl: (r.stored_image_url || r.thumbnail_url || '').trim() || undefined,
            title: (r.caption_event_title || 'Raw post').trim(),
            venueName: (r.location_name || '').trim() || undefined,
            start: (r.caption_event_start_datetime || '').trim() || undefined,
            descriptionLong: (r.caption || '').trim() || undefined,
            tags: [] as string[],
            rawRow: r,
          }) as ReviewEventItem
          : tab === 'needsReview' ? (r: Record<string, string>) => ({
            id: (r.review_id || String(Math.random())).trim(),
            imageUrl: (r.stored_image_url || r.thumbnail_url || '').trim() || undefined,
            title: (r.description_short || 'Needs review').trim(),
            venueName: (r.venue_name_raw || '').trim() || undefined,
            start: (r.start_datetime || '').trim() || undefined,
            descriptionLong: (r.caption || '').trim() || undefined,
            validationStatus: (r.validation_status || '').trim() || undefined,
            validationReasons: (r.validation_reasons || '').trim() || undefined,
            tags: [] as string[],
            rawRow: r,
          }) as ReviewEventItem
          : (r: Record<string, string>) => {
            const tagsStr = (r.tags || '').trim()
            return {
              id: (r.event_id || String(Math.random())).trim(),
              imageUrl: (r.primary_image_url || '').trim() || undefined,
              title: (r.title || 'Processed event').trim(),
              venueName: (r.venue_name || r.venue_name_raw || '').trim() || undefined,
              start: (r.start_datetime || '').trim() || undefined,
              descriptionLong: (r.description_long || r.description_short || '').trim() || undefined,
              category: (r.category || '').trim() || undefined,
              tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
              rawRow: r,
            } as ReviewEventItem
          }
          const items = rows.map(map)
          if (tab === 'raw') setRaw(items)
          else if (tab === 'needsReview') setNeedsReview(items)
          else setProcessed(items)
          setUploadingTab(null)
        },
      })
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const exportCsv = useCallback((tab: TabId) => {
    const list = tab === 'raw' ? raw : tab === 'needsReview' ? needsReview : processed
    if (list.length === 0) return
    const now = new Date().toISOString()
    const rows = list.map((item) => {
      const r = { ...item.rawRow }
      const rev = reviewsById[item.id]
      r.quality_rating = rev ? String(rev.quality) : ''
      r.notes = rev?.notes ?? ''
      r.reviewed_at = rev ? now : ''
      return r
    })
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `event-review-${tab}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [raw, needsReview, processed, reviewsById])

  const items = activeTab === 'raw' ? raw : activeTab === 'needsReview' ? needsReview : processed

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Event review</h2>
      <p className="text-slate-400 text-sm mb-6">
        Rate the quality of parsed events (1–10) and add notes. Export CSV with quality_rating and notes when done.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['raw', 'needsReview', 'processed'] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <span className="text-slate-300 text-sm">{items.length} row(s)</span>
        <label className="cursor-pointer">
          <span className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-sm hover:bg-slate-600">
            {uploadingTab === activeTab ? 'Loading…' : 'Upload CSV'}
          </span>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={uploadingTab !== null}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileUpload(activeTab, f)
              e.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => exportCsv(activeTab)}
          disabled={items.length === 0}
          className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-600 disabled:opacity-50"
        >
          Download reviewed CSV
        </button>
        <button type="button" onClick={loadFromApi} className="text-slate-400 hover:text-white text-sm">
          Reload from URLs
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500 py-8">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-center text-slate-400">
          <p>No data for this tab.</p>
          <p className="text-sm mt-1">Data loads from env URLs, or from project files (Testing - Events_Raw.csv, etc.) in the repo root, or upload a CSV above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <ReviewEventCard
              key={item.id}
              item={item}
              review={reviewsById[item.id]}
              onReviewChange={handleReviewChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
