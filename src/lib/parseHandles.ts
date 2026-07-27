/**
 * Parse one or more Instagram handles from admin/CLI input.
 * Accepts comma, whitespace, or newline separators; strips leading @; lowercases; dedupes.
 */
export function parseHandleList(input: unknown): string[] {
  if (input == null) return []
  const parts: string[] = []
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item == null) continue
      parts.push(...String(item).split(/[\s,;]+/))
    }
  } else {
    parts.push(...String(input).split(/[\s,;]+/))
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of parts) {
    const h = raw.replace(/^@/, '').trim().toLowerCase()
    if (!h || seen.has(h)) continue
    seen.add(h)
    out.push(h)
  }
  return out
}

/** Serialize handles for pipeline_runs.params / --handle= (comma-joined). */
export function serializeHandles(handles: string[]): string | undefined {
  return handles.length > 0 ? handles.join(',') : undefined
}
