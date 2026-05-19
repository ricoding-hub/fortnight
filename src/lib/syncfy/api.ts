/**
 * Client wrappers around the /api/syncfy/* routes.
 *
 * Every call attaches the current Supabase access token in the
 * Authorization header. The server verifies it before doing any work.
 */

import { supabase } from '@/lib/supabase'

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('not_authenticated')
  return { Authorization: `Bearer ${token}` }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const headers = {
    'content-type': 'application/json',
    ...(await authHeader()),
  }
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  })
  return parse<T>(res)
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: await authHeader(),
  })
  return parse<T>(res)
}

async function parse<T>(res: Response): Promise<T> {
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : `request_failed_${res.status}`
    const err = new Error(message)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  return payload as T
}

export interface TokenResponse {
  token: string
  id_user: string
}

export interface SyncSummary {
  credential_id: string
  accounts: number
  transactions: number
}

export function getSyncfyToken(): Promise<TokenResponse> {
  return post<TokenResponse>('/api/syncfy/token')
}

export function registerCredential(params: {
  id_credential: string
  id_site?: string | null
  institution_name: string
}): Promise<SyncSummary> {
  return post<SyncSummary>('/api/syncfy/credentials/register', params)
}

export function syncCredential(credentialId: string): Promise<SyncSummary> {
  return post<SyncSummary>(
    `/api/syncfy/credentials/${encodeURIComponent(credentialId)}/sync`,
  )
}

export function disconnectCredential(credentialId: string): Promise<{ ok: true }> {
  return del<{ ok: true }>(
    `/api/syncfy/credentials/${encodeURIComponent(credentialId)}`,
  )
}
