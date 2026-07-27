/**
 * Map user_profiles row fields to a public display name.
 * Signup historically wrote `name`; later migrations added `display_name`.
 */
export function profileDisplayName(p: {
  display_name?: string | null
  name?: string | null
  username?: string | null
} | null | undefined): string | null {
  if (!p) return null
  const dn = typeof p.display_name === 'string' ? p.display_name.trim() : ''
  if (dn) return dn
  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (name) return name
  const un = typeof p.username === 'string' ? p.username.trim() : ''
  return un || null
}
