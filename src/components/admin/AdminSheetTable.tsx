'use client'

import type { ReactNode } from 'react'

type Props = {
  columns: readonly string[]
  rows: Record<string, string>[]
  rowKey?: (row: Record<string, string>, index: number) => string
  onRowClick?: (row: Record<string, string>) => void
  /** Optional trailing action cell */
  renderActions?: (row: Record<string, string>) => ReactNode
  emptyText?: string
  maxCellChars?: number
}

function truncate(value: string, max: number): string {
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

/** Spreadsheet-style table: headers match Google Sheets column names exactly. */
export function AdminSheetTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  renderActions,
  emptyText = 'No rows.',
  maxCellChars = 80,
}: Props) {
  return (
    <div className="overflow-x-auto rounded border border-slate-700">
      <table className="w-full text-xs text-left border-collapse">
        <thead className="bg-slate-800 text-slate-400 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="p-2 font-medium whitespace-nowrap border-b border-slate-700"
                title={col}
              >
                {col}
              </th>
            ))}
            {renderActions && <th className="p-2 border-b border-slate-700">actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (renderActions ? 1 : 0)}
                className="p-4 text-slate-500"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                className={`border-t border-slate-800 ${
                  onRowClick ? 'hover:bg-slate-800/60 cursor-pointer' : ''
                }`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => {
                  const raw = row[col] ?? ''
                  return (
                    <td
                      key={col}
                      className="p-2 text-slate-300 whitespace-nowrap max-w-[16rem] truncate"
                      title={raw.length > maxCellChars ? raw : undefined}
                    >
                      {truncate(raw, maxCellChars)}
                    </td>
                  )
                })}
                {renderActions && (
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    {renderActions(row)}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
