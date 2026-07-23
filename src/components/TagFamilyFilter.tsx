'use client'

import { useMemo, useState } from 'react'
import { groupTagsByFamily } from '@/data/tagFamilies'
import { toCanonicalTagKey } from '@/lib/eventsAdapter'

type Props = {
  allTags: string[]
  selectedTags: string[]
  onToggle: (tag: string) => void
  onClear: () => void
  loading?: boolean
}

export default function TagFamilyFilter({
  allTags,
  selectedTags,
  onToggle,
  onClear,
  loading,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ music: true })
  const [tagSearchQuery, setTagSearchQuery] = useState('')

  const families = useMemo(
    () => groupTagsByFamily(allTags, toCanonicalTagKey),
    [allTags]
  )

  const searchHits = useMemo(() => {
    const q = tagSearchQuery.trim().toLowerCase()
    if (!q) return []
    return allTags.filter((t) => t.toLowerCase().includes(q)).slice(0, 24)
  }, [allTags, tagSearchQuery])

  if (loading) {
    return <div className="text-xs text-pager-fg-muted">Loading tags...</div>
  }
  if (allTags.length === 0) {
    return <div className="text-xs text-pager-fg-muted">No tags available</div>
  }

  return (
    <div>
      <div className="text-xs font-semibold mb-2 text-pager-fg uppercase tracking-wider">
        Tags by family
        {selectedTags.length > 0 && (
          <span className="ml-2 font-normal text-pager-fg-muted normal-case">
            ({selectedTags.length} selected)
          </span>
        )}
      </div>

      <input
        type="text"
        placeholder="Search tags..."
        value={tagSearchQuery}
        onChange={(e) => setTagSearchQuery(e.target.value)}
        className="pager-input text-xs mb-3 py-1.5"
      />

      {tagSearchQuery.trim() ? (
        <div className="flex flex-wrap gap-1.5 mb-3 max-h-40 overflow-y-auto">
          {searchHits.length === 0 ? (
            <p className="text-xs text-pager-fg-faint">No tags match</p>
          ) : (
            searchHits.map((tag) => {
              const isSelected = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggle(tag)}
                  className={`pager-pill ${isSelected ? 'pager-pill-active' : ''}`}
                >
                  {tag}
                </button>
              )
            })
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {families.map((family) => {
            const isOpen = !!expanded[family.id]
            const selectedInFamily = family.tags.filter((t) => selectedTags.includes(t)).length
            return (
              <div key={family.id} className="border border-pager-border">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [family.id]: !prev[family.id] }))
                  }
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] uppercase tracking-wider bg-pager-muted hover:bg-pager-elevated"
                >
                  <span>
                    {isOpen ? '▼' : '▶'} {family.label}
                    <span className="ml-1 text-pager-fg-faint normal-case">
                      ({family.tags.length})
                    </span>
                  </span>
                  {selectedInFamily > 0 && (
                    <span className="text-[10px] bg-pager-accent text-pager-accent-fg px-1">
                      {selectedInFamily}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-1 p-2">
                    {family.tags.map((tag) => {
                      const isSelected = selectedTags.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => onToggle(tag)}
                          className={`pager-pill ${isSelected ? 'pager-pill-active' : ''}`}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <span key={tag} className="pager-pill pager-pill-active gap-1">
              {tag}
              <button type="button" onClick={() => onToggle(tag)} aria-label={`Remove ${tag}`}>
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] uppercase tracking-wider text-pager-fg-muted hover:text-pager-fg underline"
          >
            Clear tags
          </button>
        </div>
      )}
    </div>
  )
}
