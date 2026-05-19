import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

/**
 * Verifies the caller's Supabase JWT and returns both the user and an
 * admin Supabase client that can write on the user's behalf (bypasses
 * RLS — never expose this client to the browser).
 *
 * Throws a Response with the proper status code so route handlers can
 * just rethrow it.
 */
export async function requireUser(
  req: Request,
): Promise<{ user: User; admin: SupabaseClient }> {
  const auth = req.headers.get('authorization') ?? ''
  const jwt = auth.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    throw json({ error: 'unauthorized' }, 401)
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw json({ error: 'server_misconfigured' }, 500)
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) {
    throw json({ error: 'unauthorized' }, 401)
  }

  return { user: data.user, admin }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** True if `e` is a Response we threw — lets route handlers rethrow cleanly. */
export function isResponse(e: unknown): e is Response {
  return e instanceof Response
}
