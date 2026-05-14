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
  color?: string | null
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
    const { error: err } = await supabase
      .from('accounts')
      .insert({ ...account, user_id: user.id })
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
   * Quick balance update. Records the delta as an 'adjustment' transaction;
   * the DB trigger then moves the account balance, so history is preserved
   * and we never write the balance column directly.
   */
  async function updateBalance(account: Account, newBalance: number) {
    if (!user) throw new Error('Not authenticated')
    const diff = newBalance - account.balance
    if (diff === 0) return
    const { error: err } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: account.id,
      amount: diff,
      type: 'adjustment',
      date: new Date().toISOString().slice(0, 10),
    })
    if (err) throw err
  }

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    update,
    deleteAccount,
    updateBalance,
  }
}
