/**
 * DELETE /api/syncfy/credentials/:id
 *
 * Disconnects a bank credential. Calls Syncfy to delete the upstream
 * credential, then soft-deletes locally: the row is marked
 * `status='disabled'` and its child accounts get their FK nulled (via
 * `on delete set null`) so the user's transaction history is preserved.
 */

import { isResponse, json, requireUser } from '../../../_lib/auth.ts'
import {
  deleteCredential as syncfyDeleteCredential,
  getOrCreateUser,
  mintToken,
} from '../../../_lib/syncfy.ts'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'DELETE') return json({ error: 'method_not_allowed' }, 405)
  try {
    const { user, admin } = await requireUser(req)
    const id = extractId(req.url)
    if (!id) return json({ error: 'missing_id' }, 400)

    const { data: cred } = await admin
      .from('syncfy_credentials')
      .select('syncfy_id_credential,syncfy_id_user')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (!cred) return json({ error: 'not_found' }, 404)

    // Best effort: tell Syncfy to drop the upstream credential. If that
    // fails (already gone, network blip), we still continue with local
    // soft-delete so the user is unblocked.
    try {
      const syncfyUser = await getOrCreateUser(user.id)
      const token = await mintToken(syncfyUser.id_user)
      await syncfyDeleteCredential(token, cred.syncfy_id_credential as string)
    } catch {
      // swallow
    }

    await admin
      .from('syncfy_credentials')
      .update({
        status: 'disabled',
        last_status_message: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Detach accounts from this credential so the UI hides the "synced" pill.
    // We keep external_id and source='syncfy' so the user can re-link later
    // and we can match accounts back by external_id.
    await admin
      .from('accounts')
      .update({ syncfy_credential_id: null })
      .eq('syncfy_credential_id', id)

    return json({ ok: true })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'disconnect_failed'
    return json({ error: 'disconnect_failed', message }, 500)
  }
}

function extractId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const match = url.pathname.match(
      /\/api\/syncfy\/credentials\/([^/]+)\/?$/,
    )
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}
