/**
 * POST /api/syncfy/credentials/register
 *
 * Body: { id_credential: string, id_site?: string, institution_name: string }
 *
 * Called after the Syncfy widget reports success and hands back the new
 * `id_credential`. Persists a row in `syncfy_credentials` and runs the
 * first sync inline so the user sees accounts and transactions appear
 * immediately when the modal closes.
 */

import { isResponse, json, requireUser } from '../../_lib/auth.js'
import { getOrCreateUser } from '../../_lib/syncfy.js'
import { syncCredential } from '../../_lib/sync.js'

interface RegisterBody {
  id_credential?: string
  id_site?: string | null
  institution_name?: string
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { user, admin } = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as RegisterBody
    if (!body.id_credential || !body.institution_name) {
      return json({ error: 'invalid_body' }, 400)
    }

    const syncfyUser = await getOrCreateUser(user.id, user.email)

    const { data: cred, error: insertErr } = await admin
      .from('syncfy_credentials')
      .upsert(
        {
          user_id: user.id,
          syncfy_id_credential: body.id_credential,
          syncfy_id_user: syncfyUser.id_user,
          institution_name: body.institution_name,
          institution_code: body.id_site ?? null,
          status: 'active',
        },
        { onConflict: 'user_id,syncfy_id_credential' },
      )
      .select('id')
      .single()
    if (insertErr || !cred) {
      return json({ error: 'persist_failed', message: insertErr?.message }, 500)
    }

    const summary = await syncCredential(cred.id as string, user.id, admin)
    return json({ credential_id: cred.id, ...summary })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'register_failed'
    return json({ error: 'register_failed', message }, 500)
  }
}
