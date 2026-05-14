import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Transaction, TransactionType } from '@/types'

export interface TransactionFilters {
  accountId?: string
  categoryId?: string
  dateFrom?: string
  dateTo?: string
}

export interface NewTransaction {
  account_id: string
  amount: number
  category_id?: string | null
  description?: string | null
  date?: string
  type?: TransactionType
}

const EMPTY: Transaction[] = []

export function useTransactions(filters: TransactionFilters = {}) {
  const { user } = useAuth()
  const { accountId, categoryId, dateFrom, dateTo } = filters
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchTransactions = useCallback(async () => {
    if (!user) return
    let query = supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (accountId) query = query.eq('account_id', accountId)
    if (categoryId) query = query.eq('category_id', categoryId)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)

    const { data: rows, error: err } = await query
    if (err) setError(err)
    else {
      setError(null)
      setData((rows ?? []) as Transaction[])
    }
    setLoading(false)
  }, [user, accountId, categoryId, dateFrom, dateTo])

  useEffect(() => {
    if (!user) return
    // fetchTransactions only calls setState after an await — not a synchronous effect setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTransactions()

    const channel = supabase
      .channel(`transactions:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchTransactions(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchTransactions])

  async function create(tx: NewTransaction) {
    if (!user) throw new Error('Not authenticated')
    const { error: err } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: tx.account_id,
      amount: tx.amount,
      category_id: tx.category_id ?? null,
      description: tx.description ?? null,
      type: tx.type ?? 'transaction',
      date: tx.date ?? new Date().toISOString().slice(0, 10),
    })
    if (err) throw err
  }

  async function deleteTransaction(id: string) {
    const { error: err } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
    if (err) throw err
  }

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    deleteTransaction,
  }
}
