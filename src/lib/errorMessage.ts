/**
 * Extract a human-readable message from ANY thrown value — crucially from
 * Supabase's PostgrestError / AuthError, which are plain objects (NOT Error
 * instances), so `e instanceof Error` misses their `.message`. Falls back
 * through the common shapes so real DB errors (permission, missing column,
 * unique violation, PGRST schema-cache) surface instead of a generic toast.
 */
export function errorMessage(e: unknown): string {
  if (e == null) return 'Error desconocido'
  if (typeof e === 'string') return e
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    const msg =
      (typeof o.message === 'string' && o.message) ||
      (typeof o.error_description === 'string' && o.error_description) ||
      (typeof o.details === 'string' && o.details) ||
      (typeof o.hint === 'string' && o.hint)
    if (msg) {
      return typeof o.code === 'string' && o.code ? `${o.code}: ${msg}` : msg
    }
    if (typeof o.code === 'string' && o.code) return o.code
  }
  return String(e)
}
