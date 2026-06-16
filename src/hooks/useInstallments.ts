import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
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
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const startMonthsPaid = inst.months_paid ?? 0
    const optimistic: Installment = {
      id: tempId,
      user_id: user.id,
      account_id: inst.account_id ?? null,
      name: inst.name,
      total_amount: inst.total_amount,
      monthly_amount: inst.monthly_amount,
      months_total: inst.months_total,
      months_paid: startMonthsPaid,
      start_date: inst.start_date ?? now.slice(0, 10),
      status: startMonthsPaid >= inst.months_total ? 'paid' : 'active',
      is_zero_interest: inst.is_zero_interest ?? true,
      created_at: now,
      updated_at: now,
    }
    setData((prev) => [optimistic, ...prev])
    const { error: err } = await supabase.from('installments').insert({
      ...inst,
      user_id: user.id,
      months_paid: startMonthsPaid,
      status: startMonthsPaid >= inst.months_total ? 'paid' : 'active',
      is_zero_interest: inst.is_zero_interest ?? true,
      start_date: inst.start_date ?? now.slice(0, 10),
    })
    if (err) {
      setData((prev) => prev.filter((i) => i.id !== tempId))
      throw err
    }
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
