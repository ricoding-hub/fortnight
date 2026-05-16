import { useCallback, useEffect, useRef, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import type { Goal } from '@/types'

export interface NewGoal {
  name: string
  icon?: string | null
  color?: string | null
  target: number
  saved?: number
  monthly: number
  deadline?: string | null
  is_debt?: boolean
  started_at?: string
}

const EMPTY: Goal[] = []

/**
 * Fetches the user's goals. If the user has credit debt > 0 and no goals at
 * all, seeds a "Liberar tarjetas" debt-freedom goal with a 6-month payoff.
 */
export function useGoals() {
  const { user } = useAuth()
  const { data: accounts } = useAccounts()
  const [data, setData] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | Error | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())
  const seedingRef = useRef(false)

  const fetchGoals = useCallback(async () => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true })
    if (err) {
      setError(err)
    } else {
      setError(null)
      setData(
        (rows ?? []).map((g) => ({
          ...g,
          target: Number(g.target),
          saved: Number(g.saved),
          monthly: Number(g.monthly),
        })) as Goal[],
      )
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchGoals()

    const channel = supabase
      .channel(`goals:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${user.id}` },
        () => void fetchGoals(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchGoals])

  // Seed the debt-freedom goal once when user has credit debt and no goals.
  useEffect(() => {
    if (!user || loading || data.length > 0 || seedingRef.current) return
    const creditDebt = accounts
      .filter((a) => a.type === 'credit')
      .reduce((s, a) => s + a.balance, 0)
    if (creditDebt <= 0) return

    seedingRef.current = true
    const desiredMonths = 6
    const interestBuffer = 1.05
    const monthly = Math.round((creditDebt * interestBuffer) / desiredMonths)
    const today = new Date()
    const deadline = new Date(today.getFullYear(), today.getMonth() + desiredMonths, today.getDate())

    void supabase
      .from('goals')
      .insert({
        user_id: user.id,
        name: 'Liberar tarjetas',
        icon: 'flame',
        color: '#FF5A5F',
        target: creditDebt,
        saved: 0,
        monthly,
        deadline: deadline.toISOString().slice(0, 10),
        is_debt: true,
        started_at: today.toISOString().slice(0, 10),
      })
      .then(({ error: insErr }) => {
        if (insErr) setError(insErr)
        seedingRef.current = false
        void fetchGoals()
      })
  }, [user, loading, data, accounts, fetchGoals])

  async function create(g: NewGoal): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const { error: err } = await supabase.from('goals').insert({
      user_id: user.id,
      saved: 0,
      is_debt: false,
      started_at: new Date().toISOString().slice(0, 10),
      ...g,
    })
    if (err) throw err
  }

  async function update(id: string, patch: Partial<NewGoal>): Promise<void> {
    const { error: err } = await supabase.from('goals').update(patch).eq('id', id)
    if (err) throw err
  }

  async function remove(id: string): Promise<void> {
    const { error: err } = await supabase.from('goals').delete().eq('id', id)
    if (err) throw err
  }

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    update,
    remove,
  }
}
