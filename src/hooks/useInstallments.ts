import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { getInstallmentRemaining } from '@/lib/debt'
import type { Installment } from '@/types'

export interface NewInstallment {
  name: string
  total_amount: number
  monthly_amount: number
  months_total: number
  months_paid?: number
  account_id?: string | null
  start_date?: string
  is_zero_interest?: boolean
  /**
   * Transient, never stored: put the outstanding principal on the linked card
   * so `accounts.balance` really contains what `getRevolvingBalance` has
   * always assumed. Ignored without an `account_id`.
   */
  charge_to_card?: boolean
}

export type InstallmentPatch = Partial<NewInstallment> & { months_paid?: number; status?: 'active' | 'paid' }

const EMPTY: Installment[] = []

export function useInstallments() {
  const { user } = useAuth()
  const [data, setData] = useState<Installment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchInstallments = useCallback(async () => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('installments')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err)
    else {
      setError(null)
      setData((rows ?? []) as Installment[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInstallments()

    const channel = supabase
      .channel(`installments:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'installments',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchInstallments(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchInstallments])

  async function create(inst: NewInstallment): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const { charge_to_card: chargeToCard, ...row } = inst
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const startMonthsPaid = row.months_paid ?? 0
    const startDate = row.start_date ?? now.slice(0, 10)
    const status = startMonthsPaid >= row.months_total ? 'paid' : 'active'
    const optimistic: Installment = {
      id: tempId,
      user_id: user.id,
      account_id: row.account_id ?? null,
      name: row.name,
      total_amount: row.total_amount,
      monthly_amount: row.monthly_amount,
      months_total: row.months_total,
      months_paid: startMonthsPaid,
      start_date: startDate,
      status,
      is_zero_interest: row.is_zero_interest ?? true,
      created_at: now,
      updated_at: now,
    }
    setData((prev) => [optimistic, ...prev])

    // The plan is the source of truth and the charge points back at it, so the
    // plan has to exist first — the foreign key leaves no other order.
    const { data: inserted, error: err } = await supabase
      .from('installments')
      .insert({
        ...row,
        user_id: user.id,
        months_paid: startMonthsPaid,
        status,
        is_zero_interest: row.is_zero_interest ?? true,
        start_date: startDate,
      })
      .select('id')
      .single()

    if (err || !inserted) {
      setData((prev) => prev.filter((i) => i.id !== tempId))
      throw err ?? new Error('No se pudo guardar el plan')
    }

    if (chargeToCard && row.account_id) {
      // With nothing paid yet, the card took the sticker price. Deriving it
      // from the rounded monthly instead would charge 574.52 for a 574.50
      // purchase (143.63 × 4), and those cents never wash out.
      const amount =
        startMonthsPaid === 0 ? row.total_amount : getInstallmentRemaining(optimistic)
      if (amount > 0) {
        const { error: chargeErr } = await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: row.account_id,
          amount,
          description: row.name,
          date: startDate,
          type: 'installment',
          installment_id: inserted.id,
        })
        // A plan whose charge never landed would leave the card under-reporting
        // exactly the amount we were trying to make visible. Undo it instead.
        if (chargeErr) {
          await supabase.from('installments').delete().eq('id', inserted.id)
          setData((prev) => prev.filter((i) => i.id !== tempId))
          throw chargeErr
        }
      }
    }
  }

  /** The charge row backing a plan, if the user asked us to create one. */
  async function findCharge(installmentId: string) {
    const { data: rows } = await supabase
      .from('transactions')
      .select('id, amount')
      .eq('installment_id', installmentId)
      .limit(1)
    return rows?.[0] ?? null
  }

  async function update(id: string, patch: InstallmentPatch): Promise<void> {
    const prev = data.find((i) => i.id === id)
    const now = new Date().toISOString()
    setData((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch, updated_at: now } : i)))
    const { error: err } = await supabase
      .from('installments')
      .update({ ...patch, updated_at: now })
      .eq('id', id)
    if (err) {
      if (prev) setData((cur) => cur.map((i) => (i.id === id ? prev : i)))
      throw err
    }

    // Only a correction to the plan's SIZE moves the charge. Marking a month
    // paid must not: that instalment is settled through the card payment, and
    // shrinking the charge here would take the money off the balance twice.
    const resized =
      prev != null &&
      ((patch.monthly_amount != null && Number(patch.monthly_amount) !== Number(prev.monthly_amount)) ||
        (patch.months_total != null && Number(patch.months_total) !== Number(prev.months_total)))
    if (resized) await rechargeCard(id, { ...prev, ...patch } as Installment)
  }

  /**
   * Bring an existing charge in line with a corrected plan.
   *
   * It deletes and re-inserts instead of updating the amount, because
   * `trg_update_balance` only fires on INSERT and DELETE — an UPDATE of
   * `transactions.amount` would change the row and leave the balance untouched,
   * with no error to notice.
   */
  async function rechargeCard(installmentId: string, inst: Installment): Promise<void> {
    const charge = await findCharge(installmentId)
    if (!charge) return
    const amount = getInstallmentRemaining(inst)
    if (Math.abs(Number(charge.amount) - amount) < 0.005) return

    await supabase.from('transactions').delete().eq('id', charge.id)
    if (amount > 0 && inst.account_id) {
      await supabase.from('transactions').insert({
        user_id: inst.user_id,
        account_id: inst.account_id,
        amount,
        description: inst.name,
        date: inst.start_date,
        type: 'installment',
        installment_id: installmentId,
      })
    }
  }

  async function markMonthPaid(id: string): Promise<void> {
    const inst = data.find((i) => i.id === id)
    if (!inst) return
    const newPaid = inst.months_paid + 1
    const newStatus = newPaid >= inst.months_total ? 'paid' : 'active'
    await update(id, { months_paid: newPaid, status: newStatus })
  }

  async function remove(id: string): Promise<void> {
    const prev = data.find((i) => i.id === id)
    setData((cur) => cur.filter((i) => i.id !== id))

    // Delete the charge FIRST. The foreign key is `on delete set null`, so
    // dropping the plan first would orphan the charge and leave the card
    // permanently inflated by an amount nothing on screen explains any more.
    const charge = await findCharge(id)
    if (charge) {
      const { error: chargeErr } = await supabase.from('transactions').delete().eq('id', charge.id)
      if (chargeErr) {
        if (prev) setData((cur) => [prev, ...cur])
        throw chargeErr
      }
    }

    const { error: err } = await supabase.from('installments').delete().eq('id', id)
    if (err) {
      if (prev) setData((cur) => [prev, ...cur])
      throw err
    }
  }

  const active = data.filter((i) => i.status === 'active')

  return {
    data: user ? data : EMPTY,
    active: user ? active : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    update,
    markMonthPaid,
    remove,
  }
}
