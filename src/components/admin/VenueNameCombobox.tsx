'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

type Props = {
  value: string
  venueNames: string[]
  disabled?: boolean
  onChange: (value: string) => void
}

const MAX_SUGGESTIONS = 40

/** Free-text venue field with catalog suggestions (pick existing or type a new name). */
export function VenueNameCombobox({ value, venueNames, disabled, onChange }: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const suggestions = useMemo(() => {
    const needle = value.trim().toLowerCase()
    const pool = needle
      ? venueNames.filter((n) => n.toLowerCase().includes(needle))
      : venueNames
    return pool.slice(0, MAX_SUGGESTIONS)
  }, [value, venueNames])

  const knownVenue =
    value.trim().length > 0 &&
    venueNames.some((n) => n.toLowerCase() === value.trim().toLowerCase())

  useEffect(() => {
    if (!open) return
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [suggestions, open])

  function pick(name: string) {
    onChange(name)
    setOpen(false)
  }

  function onKeyDown(ev: KeyboardEvent<HTMLInputElement>) {
    if (!open && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      setOpen(true)
      ev.preventDefault()
      return
    }
    if (!open) return
    if (ev.key === 'Escape') {
      setOpen(false)
      ev.preventDefault()
      return
    }
    if (ev.key === 'ArrowDown') {
      setHighlight((h) => Math.min(h + 1, Math.max(suggestions.length - 1, 0)))
      ev.preventDefault()
      return
    }
    if (ev.key === 'ArrowUp') {
      setHighlight((h) => Math.max(h - 1, 0))
      ev.preventDefault()
      return
    }
    if (ev.key === 'Enter' && suggestions[highlight]) {
      pick(suggestions[highlight])
      ev.preventDefault()
    }
  }

  return (
    <div ref={rootRef} className="relative mt-1">
      <div className="flex gap-1">
        <input
          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
          value={value}
          disabled={disabled}
          placeholder={
            venueNames.length
              ? 'Type a new name or pick from catalog…'
              : 'Venue name'
          }
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(ev) => {
            onChange(ev.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            if (!disabled && venueNames.length) setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        {venueNames.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            className="shrink-0 px-2 rounded border border-slate-600 bg-slate-900 text-slate-300 text-sm disabled:opacity-50"
            aria-label="Show venue catalog"
            onClick={() => setOpen((o) => !o)}
          >
            ▾
          </button>
        )}
      </div>

      {open && !disabled && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-slate-600 bg-slate-900 shadow-lg"
        >
          {suggestions.map((name, i) => (
            <li key={name} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`block w-full text-left px-2 py-1.5 text-sm ${
                  i === highlight
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => pick(name)}
              >
                {name}
              </button>
            </li>
          ))}
          {venueNames.length > MAX_SUGGESTIONS && suggestions.length >= MAX_SUGGESTIONS && (
            <li className="px-2 py-1 text-[11px] text-slate-500">
              Type to narrow — showing first {MAX_SUGGESTIONS}
            </li>
          )}
        </ul>
      )}

      {value.trim() && !disabled && (
        <span
          className={`mt-1 block text-[11px] ${
            knownVenue ? 'text-emerald-500/80' : 'text-amber-500/80'
          }`}
        >
          {knownVenue
            ? 'Matches catalog venue'
            : 'New name — not in catalog (will still save as typed)'}
        </span>
      )}
    </div>
  )
}
