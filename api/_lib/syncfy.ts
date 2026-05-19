/**
 * Typed wrapper around the Syncfy (Paybook) v1 REST API.
 *
 * The API key lives in process.env.SYNCFY_API_KEY and never leaves the
 * server. Calls return parsed JSON or throw a SyncfyError with a numeric
 * code (mapped to credential status by the sync layer).
 *
 * Reference: https://syncfy.com/w/en/sync/.../docs/mx/sync/api/catalogues
 */

const BASE = process.env.SYNCFY_BASE_URL ?? 'https://sync.paybook.com/v1'

export class SyncfyError extends Error {
  status: number
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'SyncfyError'
    this.status = status
    this.body = body
  }
}

interface RawResponse<T> {
  rid: string
  code: number
  status: boolean
  errors: unknown
  message: string | null
  response: T
}

async function call<T>(
  path: string,
  init: { method?: string; query?: Record<string, string | number>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(init.query ?? {})) {
    url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })

  let payload: RawResponse<T> | undefined
  try {
    payload = (await res.json()) as RawResponse<T>
  } catch {
    throw new SyncfyError(`Syncfy ${res.status}: non-JSON response`, res.status)
  }

  if (!res.ok || !payload.status) {
    throw new SyncfyError(
      payload.message ?? `Syncfy error ${payload.code ?? res.status}`,
      payload.code ?? res.status,
      payload,
    )
  }
  return payload.response
}

/* ---------------------------------------------------------------- */
/* User & session                                                    */
/* ---------------------------------------------------------------- */

export interface SyncfyUser {
  id_user: string
  id_external: string
}

/**
 * Idempotent on `id_external`: returns the existing user or creates a new
 * one. We use the Supabase user.id as id_external so the mapping is stable.
 */
export async function getOrCreateUser(
  fortnightUserId: string,
): Promise<SyncfyUser> {
  const apiKey = process.env.SYNCFY_API_KEY
  if (!apiKey) throw new SyncfyError('SYNCFY_API_KEY not set', 500)
  try {
    return await call<SyncfyUser>('/users', {
      method: 'POST',
      body: { id_external: fortnightUserId, api_key: apiKey },
    })
  } catch (err) {
    // If the user already exists, fall back to lookup.
    if (err instanceof SyncfyError && (err.status === 409 || err.status === 400)) {
      const list = await call<SyncfyUser[]>('/users', {
        query: { id_external: fortnightUserId, api_key: apiKey },
      })
      if (list[0]) return list[0]
    }
    throw err
  }
}

export interface SyncfySession {
  token: string
}

/** Mints a fresh session token bound to the given Syncfy id_user. */
export async function mintToken(idUser: string): Promise<string> {
  const apiKey = process.env.SYNCFY_API_KEY
  if (!apiKey) throw new SyncfyError('SYNCFY_API_KEY not set', 500)
  const session = await call<SyncfySession>('/sessions', {
    method: 'POST',
    body: { id_user: idUser, api_key: apiKey },
  })
  return session.token
}

/* ---------------------------------------------------------------- */
/* Catalog & credentials                                             */
/* ---------------------------------------------------------------- */

export interface SyncfyAccount {
  id_account: string
  id_account_type: string
  id_credential: string
  id_currency?: string
  name: string
  balance: number
  /** Some banks return credit_limit for credit-card accounts. */
  credit_limit?: number | null
  currency?: string
  is_disable?: number
  dt_refresh?: number
}

export interface SyncfyTransaction {
  id_transaction: string
  id_account: string
  id_account_type: string
  id_credential: string
  id_currency?: string
  description: string
  amount: number
  currency: string
  dt_transaction: number
  is_deleted?: number
  is_disable?: number
  is_pending?: number
}

export interface SyncfySite {
  id_site: string
  name: string
  organization?: { name: string }
}

export interface SyncfyCredentialInfo {
  id_credential: string
  id_site: string
}

export async function listAccounts(
  token: string,
  idCredential: string,
): Promise<SyncfyAccount[]> {
  return call<SyncfyAccount[]>('/accounts', {
    query: { token, id_credential: idCredential },
  })
}

export async function listTransactions(
  token: string,
  params: { id_account: string; dt_from?: number; skip?: number; limit?: number },
): Promise<SyncfyTransaction[]> {
  const query: Record<string, string | number> = {
    token,
    id_account: params.id_account,
    skip: params.skip ?? 0,
    limit: params.limit ?? 100,
  }
  if (params.dt_from != null) {
    query.dt_transaction_from = params.dt_from
  }
  return call<SyncfyTransaction[]>('/transactions', { query })
}

export async function getSite(
  token: string,
  idSite: string,
): Promise<SyncfySite | null> {
  try {
    const sites = await call<SyncfySite[]>('/catalogues/sites', {
      query: { token, id_site: idSite },
    })
    return sites[0] ?? null
  } catch {
    return null
  }
}

export async function deleteCredential(
  token: string,
  idCredential: string,
): Promise<void> {
  await call('/credentials/' + encodeURIComponent(idCredential), {
    method: 'DELETE',
    query: { token },
  })
}

/* ---------------------------------------------------------------- */
/* Account-type mapping                                              */
/* ---------------------------------------------------------------- */

/**
 * Maps Syncfy's id_account_type to Fortnight's debit/credit. Anything not
 * in this map (loans, investments, etc.) is skipped during sync — we may
 * surface unsupported types in a later iteration.
 *
 * Reference values from the Quickstart sample response:
 *   "520d3aa93b8e778e0d000000" → debit (cuenta de cheques)
 *   "520d3aa93b8e778e0d000002" → credit card
 */
const ACCOUNT_TYPE_MAP: Record<string, 'debit' | 'credit'> = {
  '520d3aa93b8e778e0d000000': 'debit',
  '520d3aa93b8e778e0d000001': 'debit', // savings → treat as debit
  '520d3aa93b8e778e0d000002': 'credit',
}

export function mapAccountType(
  idAccountType: string,
): 'debit' | 'credit' | null {
  return ACCOUNT_TYPE_MAP[idAccountType] ?? null
}

/* ---------------------------------------------------------------- */
/* Error → credential.status mapping                                 */
/* ---------------------------------------------------------------- */

export function mapErrorToStatus(
  err: unknown,
): 'token_expired' | 'login_required' | 'error' {
  if (err instanceof SyncfyError) {
    if (err.status === 401) return 'token_expired'
    if (err.status === 410 || err.status === 403) return 'login_required'
  }
  return 'error'
}
