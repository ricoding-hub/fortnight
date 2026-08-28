import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. Define VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_KEY in .env.local',
  )
}

/**
 * Hard ceiling on any request. On "lie-fi" — connected but nothing comes back —
 * a request would otherwise hang forever and the screen would sit on its
 * skeleton with no way out. Generous enough for an image upload on mobile data,
 * short enough that a dead network ends in a visible error.
 */
const REQUEST_TIMEOUT_MS = 20_000

/** Applies the timeout unless the caller already brought its own signal. */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init)
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: fetchWithTimeout },
})
