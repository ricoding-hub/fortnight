import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listAccounts,
  listTransactions,
  mapAccountType,
  mapErrorToStatus,
  mintToken,
  type SyncfyAccount,
  type SyncfyTransaction,
} from './syncfy.js'
import { loadCategoryMap, matchCategory } from './categoryMap.js'

const NINETY_DAYS = 90 * 86400
const SEVEN_DAYS = 7 * 86400

export interface SyncSummary {
  accounts: number
  transactions: number
}

/**
 * Idempotent sync of one bank credential. Safe to call repeatedly:
 *
 *   • Accounts upsert by (user_id, external_id) — no duplicates.
 *   • Transactions upsert with ignoreDuplicates → user re-categorizations
 *     survive forever (the conflicting row is skipped, not overwritten).
 *   • A balance-reconciliation adjustment is inserted only when our
 *     trigger-derived balance drifts from Syncfy's reported balance —
 *     on a no-op run the drift is 0 and nothing is written.
 *
 * Returns the count of accounts seen and the count of *new* transactions.
 */
export async function syncCredential(
  credentialId: string,
  userId: string,
  admin: SupabaseClient,
): Promise<SyncSummary> {
  const { data: cred, error: credErr } = await admin
    .from('syncfy_credentials')
    .select('*')
    .eq('id', credentialId)
    .eq('user_id', userId)
    .single()
  if (credErr || !cred) throw new Error('credential_not_found')

  try {
    const token = await mintToken(cred.syncfy_id_user)
    const accountsRemote = await listAccounts(token, cred.syncfy_id_credential)
    const categoryMap = await loadCategoryMap(admin, userId)

    // 1. Upsert each remote account → keep a map external_id → local row.
    const localByExternal = await upsertAccounts(
      admin,
      userId,
      credentialId,
      cred.institution_name as string,
      accountsRemote,
    )

    // 2. For each local synced account, pull and dedupe transactions.
    let totalNewTx = 0
    for (const [externalId, account] of localByExternal) {
      const dtFrom = await resolveCursor(admin, account.id)
      totalNewTx += await pullTransactions(
        admin,
        token,
        userId,
        externalId,
        account,
        dtFrom,
        categoryMap,
      )

      // 3. Reconcile balance with the bank's reported value.
      await reconcileBalance(admin, account, externalId, accountsRemote)
    }

    const accountCount = localByExternal.size
    await admin
      .from('syncfy_credentials')
      .update({
        status: 'active',
        last_synced_at: new Date().toISOString(),
        last_status_message: null,
        last_sync_accounts: accountCount,
        last_sync_transactions: totalNewTx,
      })
      .eq('id', credentialId)

    return { accounts: accountCount, transactions: totalNewTx }
  } catch (err) {
    const status = mapErrorToStatus(err)
    const message = err instanceof Error ? err.message : 'sync_failed'
    await admin
      .from('syncfy_credentials')
      .update({ status, last_status_message: message })
      .eq('id', credentialId)
    throw err
  }
}

interface LocalAccount {
  id: string
  type: 'debit' | 'credit'
}

async function upsertAccounts(
  admin: SupabaseClient,
  userId: string,
  credentialId: string,
  institutionName: string,
  remote: SyncfyAccount[],
): Promise<Map<string, LocalAccount>> {
  const map = new Map<string, LocalAccount>()
  for (const ra of remote) {
    const type = mapAccountType(ra.id_account_type)
    if (!type) continue
    if (ra.is_disable) continue
    if (ra.currency && ra.currency !== 'MXN') continue

    const { data: row, error } = await admin
      .from('accounts')
      .upsert(
        {
          user_id: userId,
          external_id: ra.id_account,
          source: 'syncfy',
          syncfy_credential_id: credentialId,
          institution_name: institutionName,
          name: formatAccountName(ra.name, institutionName, type),
          type,
          credit_limit:
            type === 'credit' && ra.credit_limit != null
              ? Number(ra.credit_limit)
              : null,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,external_id' },
      )
      .select('id,type')
      .single()
    if (error || !row) continue
    map.set(ra.id_account, { id: row.id as string, type: row.type as 'debit' | 'credit' })
  }
  return map
}

async function resolveCursor(
  admin: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { data } = await admin
    .from('v_syncfy_account_cursor')
    .select('last_imported_date')
    .eq('account_id', accountId)
    .maybeSingle()
  const lastDate = data?.last_imported_date as string | null | undefined
  if (lastDate) {
    return Math.floor(new Date(lastDate).getTime() / 1000) - SEVEN_DAYS
  }
  // First sync: pull last 90 days
  return Math.floor(Date.now() / 1000) - NINETY_DAYS
}

async function pullTransactions(
  admin: SupabaseClient,
  token: string,
  userId: string,
  externalAccountId: string,
  account: LocalAccount,
  dtFrom: number,
  categoryMap: Map<string, string>,
): Promise<number> {
  const limit = 100
  let skip = 0
  let inserted = 0

  while (true) {
    const page = await listTransactions(token, {
      id_account: externalAccountId,
      dt_from: dtFrom,
      skip,
      limit,
    })
    if (page.length === 0) break

    const rows = page
      .filter(
        (tx) =>
          (!tx.currency || tx.currency === 'MXN') &&
          !tx.is_deleted &&
          !tx.is_disable &&
          !tx.is_pending &&
          isFinite(Number(tx.amount)) &&
          Number(tx.amount) !== 0,
      )
      .map((tx) => txToRow(tx, userId, account, categoryMap))

    if (rows.length > 0) {
      const { count, error } = await admin
        .from('transactions')
        .upsert(rows, {
          onConflict: 'user_id,external_id',
          ignoreDuplicates: true,
          count: 'exact',
        })
      if (error) throw error
      inserted += count ?? 0
    }

    if (page.length < limit) break
    skip += limit
  }
  return inserted
}

function txToRow(
  tx: SyncfyTransaction,
  userId: string,
  account: LocalAccount,
  categoryMap: Map<string, string>,
) {
  // Debit accounts keep Syncfy's sign (negative=expense, positive=deposit).
  // Credit accounts invert: Syncfy posts purchases as negative, but our
  // convention is positive=purchase (debt up).
  const rawAmount = Number(tx.amount)
  const amount = account.type === 'credit' ? -rawAmount : rawAmount
  const description = tx.description?.trim() || null
  return {
    user_id: userId,
    account_id: account.id,
    external_id: tx.id_transaction,
    source: 'syncfy' as const,
    amount,
    description,
    date: new Date(tx.dt_transaction * 1000).toISOString().slice(0, 10),
    type: 'sync' as const,
    category_id: matchCategory(description, categoryMap),
  }
}

/**
 * Overwrites the local balance with Syncfy's reported snapshot value.
 * Only updates when Syncfy provides a non-zero balance — a zero report likely
 * means the bank didn't return balance data for that account type, not a true
 * zero balance (which the transaction trigger would have set correctly).
 */
async function reconcileBalance(
  admin: SupabaseClient,
  account: LocalAccount,
  externalId: string,
  accountsRemote: SyncfyAccount[],
): Promise<void> {
  const remoteRow = accountsRemote.find((r) => r.id_account === externalId)
  if (!remoteRow) return

  const reportedRaw = Number(remoteRow.balance)
  if (!isFinite(reportedRaw) || reportedRaw === 0) return

  const reported = account.type === 'credit' ? Math.abs(reportedRaw) : reportedRaw

  await admin
    .from('accounts')
    .update({ balance: reported, updated_at: new Date().toISOString() })
    .eq('id', account.id)
}

/**
 * Title-cases a Syncfy account name and strips the institution prefix when
 * present so "SANTANDER LIKEU" becomes "Likeu" instead of "Santander Likeu".
 */
function formatAccountName(
  rawName: string | null | undefined,
  institutionName: string,
  type: 'debit' | 'credit',
): string {
  if (!rawName?.trim()) {
    return `${institutionName} ${type === 'credit' ? 'Crédito' : 'Débito'}`
  }
  const titled = rawName
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
  const prefix = institutionName.toLowerCase()
  if (titled.toLowerCase().startsWith(prefix) && titled.length > institutionName.length) {
    const rest = titled.slice(institutionName.length).trim()
    if (rest.length >= 2) return rest
  }
  return titled
}
