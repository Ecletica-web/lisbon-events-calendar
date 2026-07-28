'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { PersonaRulesInput } from '@/lib/viewState'

export interface PersonaManagerProps {
  /** Optional: returns extra headers (e.g. Authorization) for API calls. Used for Supabase auth. */
  getAuthHeaders?: () => Promise<Record<string, string>>
}

interface Persona {
  id: string
  title: string
  rules_json: string
  share_slug?: string
  is_public?: boolean
}

interface FilterOptions {
  tags: string[]
  categories: string[]
  venues: { key: string; name: string }[]
}

interface PersonaFormData {
  title: string
  includeTags: string[]
  includeCategories: string[]
  includeVenues: string[]
  freeOnly: boolean
}

const emptyForm: PersonaFormData = {
  title: '',
  includeTags: [],
  includeCategories: [],
  includeVenues: [],
  freeOnly: false,
}

const TOTAL_STEPS = 4

const STEP_PROMPTS = [
  'Name this persona',
  'Pick tags to include',
  'Categories, venues & free',
  'Preview & confirm',
] as const

interface OptionItem {
  value: string
  label: string
}

function ChipToggle({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-2.5 py-1.5 text-xs border-2 border-terminus-strong transition-none ${
        selected
          ? 'bg-terminus-accent text-terminus-accent-fg'
          : 'bg-terminus-muted text-terminus-fg hover:bg-terminus-elevated'
      }`}
    >
      {label}
    </button>
  )
}

function FilterChipSelect({
  options,
  selected,
  onChange,
  placeholder = 'Search...',
}: {
  options: string[] | { key: string; name: string }[]
  selected: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
}) {
  const [search, setSearch] = useState('')
  const items: OptionItem[] =
    options.length === 0
      ? []
      : typeof options[0] === 'object' && options[0] !== null
        ? (options as { key: string; name: string }[]).map((o) => ({ value: o.key, label: o.name }))
        : (options as string[]).map((o) => ({ value: o, label: o }))

  const filtered = items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val))
    } else {
      onChange([...selected, val])
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="terminus-input text-sm"
      />
      <div className="max-h-40 overflow-y-auto border-2 border-terminus-strong bg-terminus-muted p-2 flex flex-wrap gap-1.5">
        {filtered.length === 0 ? (
          <p className="text-terminus-fg-faint text-sm py-2 w-full">No matches</p>
        ) : (
          filtered.map((item) => (
            <ChipToggle
              key={item.value}
              label={item.label}
              selected={selected.includes(item.value)}
              onToggle={() => toggle(item.value)}
            />
          ))
        )}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-terminus-fg-muted">{selected.length} selected</p>
      )}
    </div>
  )
}

function WizardStepHeader({ step }: { step: number }) {
  return (
    <div className="space-y-2 mb-4">
      <p className="font-pixel text-[10px] sm:text-xs text-terminus-fg-muted uppercase tracking-wider">
        STEP {step}/{TOTAL_STEPS}
      </p>
      <h3 className="font-pixel text-[10px] sm:text-xs text-terminus-fg">
        <span className="text-terminus-fg-muted mr-2">&gt;</span>
        {STEP_PROMPTS[step - 1]}
      </h3>
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm border-b border-terminus-border py-2 last:border-0">
      <span className="text-terminus-fg-muted shrink-0 w-24">{label}</span>
      <span className="text-terminus-fg break-words">{value}</span>
    </div>
  )
}

export default function PersonaManager({ getAuthHeaders }: PersonaManagerProps = {}) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PersonaFormData>(emptyForm)
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const authHeaders = useCallback(async () => {
    const h: Record<string, string> = {}
    if (getAuthHeaders) {
      const extra = await getAuthHeaders()
      Object.assign(h, extra)
    }
    return h
  }, [getAuthHeaders])

  useEffect(() => {
    loadPersonas()
    loadFilterOptions()
  }, [])

  const loadPersonas = async () => {
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/personas', { headers })
      if (res.ok) {
        const { personas: p } = await res.json()
        setPersonas(p)
      }
    } catch (e) {
      console.error('Load personas:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadFilterOptions = async () => {
    try {
      const res = await fetch('/api/filter-options')
      if (res.ok) {
        const data = await res.json()
        setFilterOptions({
          tags: data.tags || [],
          categories: data.categories || [],
          venues: data.venues || [],
        })
      }
    } catch (e) {
      console.error('Load filter options:', e)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setStep(1)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (p: Persona) => {
    let rules: PersonaRulesInput = {}
    try {
      rules = typeof p.rules_json === 'string' ? JSON.parse(p.rules_json) : p.rules_json
    } catch {}
    setEditingId(p.id)
    setForm({
      title: p.title,
      includeTags: rules.includeTags || [],
      includeCategories: rules.includeCategories || [],
      includeVenues: rules.includeVenues || [],
      freeOnly: !!rules.freeOnly,
    })
    setStep(1)
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm)
    setStep(1)
    setError(null)
  }

  const canAdvance = (): boolean => {
    if (step === 1) return form.title.trim().length > 0
    return true
  }

  const goNext = () => {
    setError(null)
    if (step === 1 && !form.title.trim()) {
      setError('Name is required')
      return
    }
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
  }

  const goBack = () => {
    setError(null)
    if (step > 1) setStep((s) => s - 1)
  }

  const handleSave = async () => {
    setError(null)
    if (!form.title.trim()) {
      setError('Name is required')
      setStep(1)
      return
    }

    setSaving(true)
    try {
      const rules: PersonaRulesInput = {
        includeTags: form.includeTags.length ? form.includeTags : undefined,
        includeCategories: form.includeCategories.length ? form.includeCategories : undefined,
        includeVenues: form.includeVenues.length ? form.includeVenues : undefined,
        freeOnly: form.freeOnly || undefined,
      }

      if (editingId) {
        const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
        const res = await fetch(`/api/personas/${editingId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ title: form.title.trim(), rules }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update')
        }
        const { persona } = await res.json()
        setPersonas((prev) => prev.map((p) => (p.id === editingId ? persona : p)))
      } else {
        const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
        const res = await fetch('/api/personas', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: form.title.trim(), rules }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create')
        }
        const { persona } = await res.json()
        setPersonas((prev) => [...prev, persona])
      }
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this persona?')) return
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/personas/${id}`, { method: 'DELETE', headers })
      if (res.ok) {
        setPersonas((prev) => prev.filter((p) => p.id !== id))
      }
    } catch (e) {
      console.error('Delete persona:', e)
    }
  }

  const venueLabel = (key: string) =>
    filterOptions?.venues.find((v) => v.key === key)?.name || key

  if (loading) {
    return <p className="text-terminus-fg-faint">Loading personas...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg">{'> PERSONAS'}</h2>
        <button
          onClick={openCreate}
          className="terminus-btn terminus-btn-primary px-4 py-2 text-sm"
        >
          + Create Persona
        </button>
      </div>

      <p className="text-terminus-fg-muted text-sm">
        Personas are custom views that apply your chosen filters (tags, categories, venues) to the calendar.
      </p>

      {personas.length === 0 ? (
        <p className="text-terminus-fg-faint py-4">No personas yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {personas.map((p) => (
            <div
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-terminus-muted border-2 border-terminus-strong hover:border-terminus-strong transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/calendar?personaId=${p.id}`}
                  className="font-medium terminus-link"
                >
                  {p.title}
                </Link>
                {p.is_public && p.share_slug && (
                  <Link
                    href={`/p/${p.share_slug}`}
                    className="text-xs text-terminus-fg-muted hover:text-terminus-fg"
                  >
                    Share
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(p)}
                  className="px-3 py-1.5 text-sm text-terminus-fg-muted hover:text-terminus-fg hover:bg-terminus-muted transition-colors"
                >
                  Edit filters
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="px-3 py-1.5 text-sm text-terminus-fg hover:bg-terminus-muted transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="terminus-panel w-full max-w-lg max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="font-pixel text-[10px] sm:text-xs text-terminus-fg">
                  {editingId ? '> EDIT PERSONA' : '> CREATE PERSONA'}
                </p>
                <button
                  type="button"
                  onClick={closeModal}
                  className="terminus-btn terminus-btn-ghost text-xs px-2 py-1"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <WizardStepHeader step={step} />

              <div className="space-y-4 min-h-[180px]">
                {step === 1 && (
                  <div>
                    <label className="block text-sm text-terminus-fg-muted mb-1">
                      <span className="text-terminus-fg-muted mr-1">&gt;</span>
                      name
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          goNext()
                        }
                      }}
                      placeholder="e.g. Jazz nights"
                      className="terminus-input"
                      autoFocus
                    />
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <label className="block text-sm text-terminus-fg-muted mb-2">
                      <span className="text-terminus-fg-muted mr-1">&gt;</span>
                      tags (any match)
                    </label>
                    {filterOptions ? (
                      <FilterChipSelect
                        options={filterOptions.tags}
                        selected={form.includeTags}
                        onChange={(v) => setForm((f) => ({ ...f, includeTags: v }))}
                        placeholder="Search tags..."
                      />
                    ) : (
                      <p className="text-terminus-fg-faint text-sm">Loading options...</p>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    {filterOptions ? (
                      <>
                        <div>
                          <label className="block text-sm text-terminus-fg-muted mb-2">
                            <span className="text-terminus-fg-muted mr-1">&gt;</span>
                            categories
                          </label>
                          <FilterChipSelect
                            options={filterOptions.categories}
                            selected={form.includeCategories}
                            onChange={(v) => setForm((f) => ({ ...f, includeCategories: v }))}
                            placeholder="Search categories..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-terminus-fg-muted mb-2">
                            <span className="text-terminus-fg-muted mr-1">&gt;</span>
                            venues
                          </label>
                          <FilterChipSelect
                            options={filterOptions.venues}
                            selected={form.includeVenues}
                            onChange={(v) => setForm((f) => ({ ...f, includeVenues: v }))}
                            placeholder="Search venues..."
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-terminus-fg-faint text-sm">Loading options...</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, freeOnly: !f.freeOnly }))}
                      className={`w-full flex items-center gap-3 p-3 border-2 border-terminus-strong text-left transition-none ${
                        form.freeOnly
                          ? 'bg-terminus-accent text-terminus-accent-fg'
                          : 'bg-terminus-muted text-terminus-fg hover:bg-terminus-elevated'
                      }`}
                    >
                      <span className="font-pixel text-[10px]">{form.freeOnly ? '[x]' : '[ ]'}</span>
                      <span className="text-sm">Free events only</span>
                    </button>
                  </div>
                )}

                {step === 4 && (
                  <div className="border-2 border-terminus-strong bg-terminus-muted p-3">
                    <PreviewRow label="> name" value={form.title.trim() || '—'} />
                    <PreviewRow
                      label="> tags"
                      value={form.includeTags.length ? form.includeTags.join(', ') : '(any)'}
                    />
                    <PreviewRow
                      label="> cats"
                      value={
                        form.includeCategories.length
                          ? form.includeCategories.join(', ')
                          : '(any)'
                      }
                    />
                    <PreviewRow
                      label="> venues"
                      value={
                        form.includeVenues.length
                          ? form.includeVenues.map(venueLabel).join(', ')
                          : '(any)'
                      }
                    />
                    <PreviewRow label="> free" value={form.freeOnly ? 'yes' : 'no'} />
                  </div>
                )}
              </div>

              {error && <p className="text-terminus-fg-muted text-sm mt-3">{error}</p>}

              <div className="flex flex-wrap gap-2 pt-5">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="terminus-btn px-4 py-2 text-sm"
                    disabled={saving}
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="terminus-btn px-4 py-2 text-sm"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                )}
                <div className="flex-1" />
                {step < TOTAL_STEPS ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canAdvance()}
                    className="terminus-btn terminus-btn-primary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="terminus-btn terminus-btn-primary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
