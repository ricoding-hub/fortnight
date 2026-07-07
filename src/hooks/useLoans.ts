import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Loan, LoanDirection, LoanPayment } from '@/types'

export interface NewLoan {
  name: string
  amount: number
  direction?: LoanDirection
  notes?: string | null
  /** Split group to stamp the loan into (direct 2-person group). */
  group_id?: string | null
}

export type LoanPatch = Partial<Pick<NewLoan, 'name' | 'amount' | 'notes' | 'direction'>>

export interface MarkPaidOpts {
  accountId?: string | null
  /** Amount to record; defaults to remaining balance if omitted. */
  amount?: number
}

const EMPTY: Loan[] = []
const EMPTY_PAYMENTS: LoanPayment[] = []

/** Remaining balance on a loan after partial payments. */
export function loanRemaining(loan: Loan, payments: LoanPayment[]): number {
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0)
  return Math.max(0, Number(loan.amount) - paid)
}

export function useLoans() {
  const { user } = useAuth()
  const [data, setData] = useState<Loan[]>([])
  const [payments, setPayments] = useState<LoanPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const [paymentsTableReady, setPaymentsTableReady] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const [loansRes, paymentsRes] = await Promise.all([
      supabase.from('loans').select('*').order('created_at', { ascending: false }),
      supabase.from('loan_payments').select('*').order('created_at', { ascending: true }),
    ])
    if (loansRes.error) { setError(loansRes.error); return }
    setError(null)
    setData((loansRes.data ?? []) as Loan[])
    // Treat a loan_payments error as empty — migration 018 may not be applied yet.
    if (!paymentsRes.error) {
      setPayments((paymentsRes.data ?? []) as LoanPayment[])
      setPaymentsTableReady(true)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()

    const ch = supabase.channel(`loans:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loans', filter: `user_id=eq.${user.id}` },
        () => void fetchAll(),
      )

    // Only subscribe to loan_payments realtime once we know the table exists,
    // so a missing table cannot disrupt the shared WebSocket connection.
    if (paymentsTableReady) {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loan_payments', filter: `user_id=eq.${user.id}` },
        () => void fetchAll(),
      )
    }

    ch.subscribe()

    return () => { void supabase.removeChannel(ch) }
  }, [user, channelKey, fetchAll, paymentsTableReady])

  const active = useMemo(() => data.filter((l) => !l.paid_at), [data])
  const paid = useMemo(() => data.filter((l) => l.paid_at), [data])

  const paymentsByLoan = useMemo(() => {
    const map: Record<string, LoanPayment[]> = {}
    for (const p of payments) {
      map[p.loan_id] = [...(map[p.loan_id] ?? []), p]
    }
    return map
  }, [payments])

  // KPI memos — remaining balances, not just raw amounts
  const porCobrar = useMemo(
    () =>
      active
        .filter((l) => l.direction === 'owed_to_me')
        .reduce((s, l) => s + loanRemaining(l, paymentsByLoan[l.id] ?? []), 0),
    [active, paymentsByLoan],
  )
  const porPagar = useMemo(
    () =>
      active
        .filter((l) => l.direction === 'i_owe')
        .reduce((s, l) => s + loanRemaining(l, paymentsByLoan[l.id] ?? []), 0),
    [active, paymentsByLoan],
  )
  const saldados = useMemo(() => paid.reduce((s, l) => s + Number(l.amount), 0), [paid])

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function create(loan: NewLoan) {
    if (!user) throw new Error('Not authenticated')
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: Loan = {
      id: tempId,
      user_id: user.id,
      notes: loan.notes ?? null,
      direction: loan.direction ?? 'owed_to_me',
      paid_at: null,
      created_at: now,
      amount: loan.amount,
      name: loan.name,
      group_id: loan.group_id ?? null,
    }
    setData((prev) => [optimistic, ...prev])
    // Omit group_id entirely when absent so the insert still works against a
    // database where migration 021 hasn't been applied yet.
    const { group_id, ...rest } = loan
    const { error: err } = await supabase
      .from('loans')
      .insert({
        ...rest,
        direction: loan.direction ?? 'owed_to_me',
        user_id: user.id,
        ...(group_id ? { group_id } : {}),
      })
    if (err) {
      setData((prev) => prev.filter((l) => l.id !== tempId))
      throw err
    }
  }

  async function update(id: string, patch: LoanPatch) {
    const prev = data.find((l) => l.id === id)
    setData((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    const { error: err } = await supabase.from('loans').update(patch).eq('id', id)
    if (err) {
      if (prev) setData((cur) => cur.map((l) => (l.id === id ? prev : l)))
      throw err
    }
  }

  async function markPaid(id: string, opts?: MarkPaidOpts) {
    if (!user) throw new Error('Not authenticated')
    const loan = data.find((l) => l.id === id)
    if (!loan) return
    const paidAt = new Date().toISOString()
    const today = paidAt.slice(0, 10)

    // Optionally create an account transaction
    if (opts?.accountId) {
      const resolvedAmount = opts.amount ?? loanRemaining(loan, paymentsByLoan[id] ?? [])
      if (resolvedAmount > 0) {
        const txAmount = loan.direction === 'owed_to_me' ? resolvedAmount : -resolvedAmount
        await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: opts.accountId,
          amount: txAmount,
          type: 'transaction',
          description: `Saldo préstamo: ${loan.name}`,
          date: today,
        })
      }
    }

    setData((cur) => cur.map((l) => (l.id === id ? { ...l, paid_at: paidAt } : l)))
    const { error: err } = await supabase
      .from('loans')
      .update({ paid_at: paidAt })
      .eq('id', id)
    if (err) {
      setData((cur) => cur.map((l) => (l.id === id ? { ...l, paid_at: null } : l)))
      throw err
    }
  }

  async function unmarkPaid(id: string) {
    const prev = data.find((l) => l.id === id)
    setData((cur) => cur.map((l) => (l.id === id ? { ...l, paid_at: null } : l)))
    const { error: err } = await supabase
      .from('loans')
      .update({ paid_at: null })
      .eq('id', id)
    if (err) {
      if (prev) setData((cur) => cur.map((l) => (l.id === id ? prev : l)))
      throw err
    }
  }

  async function deleteLoan(id: string) {
    const prev = data.find((l) => l.id === id)
    setData((cur) => cur.filter((l) => l.id !== id))
    const { error: err } = await supabase.from('loans').delete().eq('id', id)
    if (err) {
      if (prev) setData((cur) => [prev, ...cur])
      throw err
    }
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async function addPayment(
    loanId: string,
    amount: number,
    opts?: { accountId?: string | null; note?: string | null },
  ) {
    if (!user) throw new Error('Not authenticated')
    const loan = data.find((l) => l.id === loanId)
    if (!loan) return
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: LoanPayment = {
      id: tempId,
      loan_id: loanId,
      user_id: user.id,
      amount,
      note: opts?.note ?? null,
      created_at: now,
    }
    setPayments((prev) => [...prev, optimistic])

    // Optionally create account transaction
    if (opts?.accountId) {
      const txAmount = loan.direction === 'owed_to_me' ? amount : -amount
      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: opts.accountId,
        amount: txAmount,
        type: 'transaction',
        description: `Abono: ${loan.name}`,
        date: now.slice(0, 10),
      })
    }

    const { error: err } = await supabase.from('loan_payments').insert({
      loan_id: loanId,
      user_id: user.id,
      amount,
      note: opts?.note ?? null,
    })
    if (err) {
      setPayments((prev) => prev.filter((p) => p.id !== tempId))
      throw err
    }
  }

  async function deletePayment(paymentId: string) {
    const prev = payments.find((p) => p.id === paymentId)
    setPayments((cur) => cur.filter((p) => p.id !== paymentId))
    const { error: err } = await supabase
      .from('loan_payments')
      .delete()
      .eq('id', paymentId)
    if (err) {
      if (prev) setPayments((cur) => [...cur, prev])
      throw err
    }
  }

  return {
    data: user ? data : EMPTY,
    active: user ? active : EMPTY,
    paid: user ? paid : EMPTY,
    payments: user ? payments : EMPTY_PAYMENTS,
    paymentsByLoan: user ? paymentsByLoan : {},
    porCobrar,
    porPagar,
    saldados,
    loading: user ? loading : false,
    error,
    create,
    update,
    markPaid,
    unmarkPaid,
    deleteLoan,
    addPayment,
    deletePayment,
    refetch: fetchAll,
  }
}
