/**
 * POST /api/syncfy/credentials/:id/sync
 *
 * Re-syncs an existing credential — fired by the manual "Sincronizar ahora"
 * button and by useAutoSync on app open if the last sync is stale (>6h).
 *
 * Idempotent: see api/_lib/sync.ts. Running this twice in a row produces
 * zero new rows.
 */

import { isResponse, json, requireUser } from '../../../_lib/auth.js'
import { syncCredential } from '../../../_lib/sync.js'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const { user, admin } = await requireUser(req)
    const id = extractId(req.url)
    if (!id) return json({ error: 'missing_id' }, 400)
    const summary = await syncCredential(id, user.id, admin)
    return json({ credential_id: id, ...summary })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'sync_failed'
    return json({ error: 'sync_failed', message }, 500)
  }
}

/**
 * Extracts the [id] segment from /api/syncfy/credentials/:id/sync.
 * Vercel passes the resolved value via the URL path; we parse it from
 * the request URL because the Web Standard handler does not receive
 * a destructured params object.
 */
function extractId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const match = url.pathname.match(
      /\/api\/syncfy\/credentials\/([^/]+)\/sync\/?$/,
    )
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}
