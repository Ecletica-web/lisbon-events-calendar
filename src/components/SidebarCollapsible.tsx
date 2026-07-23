'use client'

import { type ReactNode } from 'react'

type Props = {
  id: string
  title: string
  countLabel?: string
  selectedCount?: number
  open: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
}

/** Expand/collapse section for calendar sidebar filters. */
export default function SidebarCollapsible({
  title,
  countLabel,
  selectedCount = 0,
  open,
  onToggle,
  children,
  className = '',
}: Props) {
  return (
    <div className={`mb-3 border-2 border-pager-border ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left bg-pager-muted hover:bg-pager-elevated"
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-pager-fg">
          <span className="inline-block w-3" aria-hidden>
            {open ? '▼' : '▶'}
          </span>{' '}
          {title}
          {countLabel && (
            <span className="ml-1 font-normal text-pager-fg-faint normal-case">{countLabel}</span>
          )}
        </span>
        {selectedCount > 0 && (
          <span className="text-[10px] bg-pager-accent text-pager-accent-fg px-1.5 py-0.5 shrink-0">
            {selectedCount}
          </span>
        )}
      </button>
      {open && <div className="p-2.5 border-t-2 border-pager-border bg-pager-elevated">{children}</div>}
    </div>
  )
}
