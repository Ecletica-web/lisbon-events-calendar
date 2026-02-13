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

interface OptionItem {
  value: string
  label: string
}

function FilterMultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Search...',
}: {
  label: string
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
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-600/50 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-2"
      />
      <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-600/50 bg-slate-800/60 p-2 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-slate-500 text-sm py-2">No matches</p>
        ) : (
          filtered.map((item) => (
            <label
              key={item.value}
              className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-700/50 cursor-pointer text-sm text-slate-200"
            >
              <input
                type="checkbox"
                checked={selected.includes(item.value)}
                onChange={() => toggle(item.value)}
                className="rounded border-slate-600 text-indigo-600 focus:ring-indigo-500/50"
              />
              {item.label}
            </label>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-slate-400 mt-1">{selected.length} selected</p>
      )}
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
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.title.trim()) {
      setError('Name is required')
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

  if (loading) {
    return <p className="text-slate-500">Loading personas...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-200">My Personas</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium hover:from-indigo-500 hover:to-purple-500 transition-all"
        >
          + Create Persona
        </button>
      </div>

      <p className="text-slate-400 text-sm">
        Personas are custom views that apply your chosen filters (tags, categories, venues) to the calendar.
      </p>

      {personas.length === 0 ? (
        <p className="text-slate-500 py-4">No personas yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {personas.map((p) => (
            <div
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/calendar?personaId=${p.id}`}
                  className="font-medium text-indigo-400 hover:text-indigo-300"
                >
                  {p.title}
                </Link>
                {p.is_public && p.share_slug && (
                  <Link
                    href={`/p/${p.share_slug}`}
                    className="text-xs text-slate-400 hover:text-indigo-400"
                  >
                    Share
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(p)}
                  className="px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
                >
                  Edit filters
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
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
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-slate-800 border border-slate-600/50 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                {editingId ? 'Edit Persona' : 'Create Persona'}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Jazz nights"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-600/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    autoFocus
                  />
                </div>

                {filterOptions && (
                  <>
                    <FilterMultiSelect
                      label="Include tags (any match)"
                      options={filterOptions.tags}
                      selected={form.includeTags}
                      onChange={(v) => setForm((f) => ({ ...f, includeTags: v }))}
                    />
                    <FilterMultiSelect
                      label="Include categories"
                      options={filterOptions.categories}
                      selected={form.includeCategories}
                      onChange={(v) => setForm((f) => ({ ...f, includeCategories: v }))}
                    />
                    <FilterMultiSelect
                      label="Include venues"
                      options={filterOptions.venues}
                      selected={form.includeVenues}
                      onChange={(v) => setForm((f) => ({ ...f, includeVenues: v }))}
                    />
                  </>
                )}

                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.freeOnly}
                    onChange={(e) => setForm((f) => ({ ...f, freeOnly: e.target.checked }))}
                    className="rounded border-slate-600 text-indigo-600 focus:ring-indigo-500/50"
                  />
                  <span className="text-slate-200">Free events only</span>
                </label>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
