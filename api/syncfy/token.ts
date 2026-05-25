/**
 * POST /api/syncfy/token
 *
 * Mints a fresh session token for the Syncfy widget, bound to the current
 * Fortnight user. The widget uses this token to capture bank credentials
 * inside Syncfy's domain — Fortnight never sees the bank login.
 *
 * Idempotent on the Fortnight user.id: Syncfy keys their user by our
 * `id_external` (= supabase user.id), so calling /users repeatedly returns
 * the same id_user.
 */

import { getOrCreateUser, mintToken } from '../_lib/syncfy.js'
import { isResponse, json, requireUser } from '../_lib/auth.js'

export async function POST(req: Request): Promise<Response> {
  try {
    const { user } = await requireUser(req)
    const syncfyUser = await getOrCreateUser(user.id)
    const token = await mintToken(syncfyUser.id_user)
    return json({ token, id_user: syncfyUser.id_user })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'token_failed'
    return json({ error: 'token_failed', message }, 500)
  }
}
