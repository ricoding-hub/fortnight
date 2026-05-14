import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Loan } from '@/types'

export interface NewLoan {
  name: string
  amount: number
  notes?: string | null
}

export type LoanPatch = Partial<NewLoan>

const EMPTY: Loan[] = []

export function useLoans() {
  const { user } = useAuth()
  const [data, setData] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchLoans = useCallback(async () => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('loans')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err)
    else {
      setError(null)
      setData((rows ?? []) as Loan[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // fetchLoans only calls setState after an await — not a synchronous effect setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLoans()

    const channel = supabase
      .channel(`loans:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'loans',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchLoans(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchLoans])

  const active = useMemo(() => data.filter((loan) => !loan.paid_at), [data])
  const paid = useMemo(() => data.filter((loan) => loan.paid_at), [data])

  async function create(loan: NewLoan) {
    if (!user) throw new Error('Not authenticated')
    const { error: err } = await supabase
      .from('loans')
      .insert({ ...loan, user_id: user.id })
    if (err) throw err
  }

  async function update(id: string, patch: LoanPatch) {
    const { error: err } = await supabase
      .from('loans')
      .update(patch)
      .eq('id', id)
    if (err) throw err
  }

  async function markPaid(id: string) {
    const { error: err } = await supabase
      .from('loans')
      .update({ paid_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
  }

  async function deleteLoan(id: string) {
    const { error: err } = await supabase.from('loans').delete().eq('id', id)
    if (err) throw err
  }

  return {
    data: user ? data : EMPTY,
    active: user ? active : EMPTY,
    paid: user ? paid : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    update,
    markPaid,
    deleteLoan,
  }
}
