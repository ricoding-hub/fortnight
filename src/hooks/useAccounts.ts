import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Account } from '@/types'

export interface NewAccount {
  name: string
  type: Account['type']
  balance?: number
  credit_limit?: number | null
  cut_day?: number | null
  payment_due_day?: number | null
  payment_grace_days?: number | null
  color?: string | null
  logo_domain?: string | null
}

export type AccountPatch = Partial<NewAccount>

const EMPTY: Account[] = []

export function useAccounts() {
  const { user } = useAuth()
  const [data, setData] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchAccounts = useCallback(async () => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('accounts')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (err) setError(err)
    else {
      setError(null)
      setData((rows ?? []) as Account[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // fetchAccounts only calls setState after an await — not a synchronous effect setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAccounts()

    const channel = supabase
      .channel(`accounts:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchAccounts(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchAccounts])

  async function create(account: NewAccount) {
    if (!user) throw new Error('Not authenticated')
    // New accounts go to the end of the list.
    const maxSort = data.reduce(
      (max, a) => ((a.sort_order ?? 0) > max ? (a.sort_order ?? 0) : max),
      0,
    )
    const { error: err } = await supabase
      .from('accounts')
      .insert({ ...account, user_id: user.id, sort_order: maxSort + 1 })
    if (err) throw err
  }

  async function update(id: string, patch: AccountPatch) {
    const { error: err } = await supabase
      .from('accounts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
  }

  async function deleteAccount(id: string) {
    const { error: err } = await supabase.from('accounts').delete().eq('id', id)
    if (err) throw err
  }

  /**
   * Swap the sort_order of `accountId` with its neighbor in the same `type`
   * group (debit or credit). `direction` = -1 moves up, +1 moves down.
   * Realtime corrects any flicker if both updates land out of order.
   */
  async function move(accountId: string, direction: -1 | 1) {
    const acc = data.find((a) => a.id === accountId)
    if (!acc) return
    // Sort nulls last so they remain at the end while the user reorders.
    const SORT_END = Number.MAX_SAFE_INTEGER
    const sortKey = (a: Account) => a.sort_order ?? SORT_END
    const group = data
      .filter((a) => a.type === acc.type)
      .sort((a, b) => sortKey(a) - sortKey(b))
    const idx = group.findIndex((a) => a.id === accountId)
    const swapWith = group[idx + direction]
    if (!swapWith) return

    // Ensure both rows have concrete sort values. Backfill nulls based on
    // their current visual position so the move feels stable.
    const baseStamp = Math.floor(Date.now() / 1000)
    const accSort = acc.sort_order ?? baseStamp + idx
    const swapSort = swapWith.sort_order ?? baseStamp + idx + direction

    // Optimistic local swap so the UI doesn't lag the network roundtrip.
    setData((prev) =>
      prev.map((a) => {
        if (a.id === acc.id) return { ...a, sort_order: swapSort }
        if (a.id === swapWith.id) return { ...a, sort_order: accSort }
        return a
      }),
    )

    const results = await Promise.all([
      supabase
        .from('accounts')
        .update({ sort_order: swapSort })
        .eq('id', acc.id),
      supabase
        .from('accounts')
        .update({ sort_order: accSort })
        .eq('id', swapWith.id),
    ])
    const err = results.find((r) => r.error)?.error ?? null

    if (err) {
      // Revert on failure — realtime would correct it anyway but this is faster.
      setData((prev) =>
        prev.map((a) => {
          if (a.id === acc.id) return { ...a, sort_order: acc.sort_order }
          if (a.id === swapWith.id)
            return { ...a, sort_order: swapWith.sort_order }
          return a
        }),
      )
      throw err
    }
  }

  /**
   * Quick balance update. Records the delta as an 'adjustment' transaction;
   * the DB trigger then moves the account balance, so history is preserved
   * and we never write the balance column directly.
   *
   * We apply an optimistic update immediately so the UI reflects the new
   * balance without waiting for the DB trigger → realtime → re-fetch cycle.
   */
  async function updateBalance(account: Account, newBalance: number) {
    if (!user) throw new Error('Not authenticated')
    // Synced accounts derive their balance from imported transactions plus
    // the periodic reconciliation adjustment. Manual edits would drift
    // immediately and confuse the next sync. The UI hides the editor too,
    // but this is the defense-in-depth check.
    if (account.source === 'syncfy') {
      throw new Error('Cuenta sincronizada: el saldo se actualiza automáticamente.')
    }
    const diff = newBalance - account.balance
    if (diff === 0) return

    // Optimistic: update local state immediately
    const now = new Date().toISOString()
    setData((prev) =>
      prev.map((a) =>
        a.id === account.id ? { ...a, balance: newBalance, updated_at: now } : a,
      ),
    )

    const { error: err } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: account.id,
      amount: diff,
      type: 'adjustment',
      date: new Date().toISOString().slice(0, 10),
    })

    if (err) {
      // Revert optimistic update on failure
      setData((prev) =>
        prev.map((a) =>
          a.id === account.id ? { ...a, balance: account.balance, updated_at: account.updated_at } : a,
        ),
      )
      throw err
    }
  }

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    update,
    deleteAccount,
    updateBalance,
    move,
  }
}
