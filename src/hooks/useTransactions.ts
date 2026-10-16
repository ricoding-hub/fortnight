import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Transaction, TransactionType } from '@/types'
import { toKey } from '@/lib/calendar'
import { tieneEsquemaMsi } from '@/lib/esquema'

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
  /** Only for the `type='installment'` charge that links a plan to its card. */
  installment_id?: string | null
}

export type TransactionPatch = Partial<Pick<Transaction, 'amount' | 'date' | 'description' | 'category_id' | 'account_id'>>

/** Sin la migración 036, editar monto o cuenta no movería el saldo. */
export const MIGRACION_PARA_EDITAR = 'Para cambiar el monto o la cuenta, corre la migración 036 en Supabase.'

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
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const row: Transaction = {
      id: tempId,
      user_id: user.id,
      account_id: tx.account_id,
      amount: tx.amount,
      category_id: tx.category_id ?? null,
      description: tx.description ?? null,
      type: tx.type ?? 'transaction',
      date: tx.date ?? toKey(new Date()),
      created_at: now,
      source: 'manual',
      external_id: null,
      installment_id: tx.installment_id ?? null,
    }
    setData((prev) => [row, ...prev])
    const { error: err } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: tx.account_id,
      amount: tx.amount,
      category_id: tx.category_id ?? null,
      description: tx.description ?? null,
      type: tx.type ?? 'transaction',
      date: tx.date ?? toKey(new Date()),
      installment_id: tx.installment_id ?? null,
    })
    if (err) {
      setData((prev) => prev.filter((t) => t.id !== tempId))
      throw err
    }
  }

  /** Borra un movimiento. Un pago de tarjeta se borra completo: sus dos partes. */
  async function deleteTransaction(id: string) {
    const prev = data.find((t) => t.id === id)
    const transferId = prev?.transfer_id ?? null
    const quitados = data.filter((t) => t.id === id || (transferId != null && t.transfer_id === transferId))
    setData((cur) => cur.filter((t) => !quitados.includes(t)))
    const q = supabase.from('transactions').delete()
    const { error: err } = transferId ? await q.eq('transfer_id', transferId) : await q.eq('id', id)
    if (err) {
      setData((cur) => [...quitados, ...cur])
      throw err
    }
  }

  /**
   * Editar un movimiento. Con la migración 036 el trigger recalcula el saldo al
   * cambiar monto o cuenta; antes de ella sólo se pueden cambiar categoría,
   * nota y fecha (que no mueven saldos), y se dice por qué.
   */
  async function update(id: string, patch: TransactionPatch) {
    const prev = data.find((t) => t.id === id)
    const mueveSaldo =
      prev != null &&
      ((patch.amount !== undefined && Number(patch.amount) !== Number(prev.amount)) ||
        (patch.account_id !== undefined && patch.account_id !== prev.account_id))
    const transferId = prev?.transfer_id ?? null
    if (transferId && mueveSaldo) {
      // Las dos partes de un pago tienen que moverse juntas.
      throw new Error('Para cambiar el monto o la cuenta de un pago, bórralo y regístralo otra vez.')
    }
    if (mueveSaldo && !(await tieneEsquemaMsi())) throw new Error(MIGRACION_PARA_EDITAR)
    // Fecha y nota de un pago se cambian en sus dos partes.
    const enUno = (t: Transaction) => t.id === id || (transferId != null && t.transfer_id === transferId)
    const cambios: TransactionPatch = transferId
      ? { ...(patch.date !== undefined ? { date: patch.date } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) }
      : patch
    setData((cur) => cur.map((t) => (enUno(t) ? { ...t, ...cambios } : t)))
    const q = supabase.from('transactions').update(cambios)
    const { error: err } = transferId ? await q.eq('transfer_id', transferId) : await q.eq('id', id)
    if (err) {
      void fetchTransactions()
      throw err
    }
  }

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    update,
    deleteTransaction,
  }
}
