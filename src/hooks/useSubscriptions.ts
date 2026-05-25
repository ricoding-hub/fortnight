import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Subscription, NewSubscription, SubscriptionPatch } from '@/types'

export function useSubscriptions() {
  const { user } = useAuth()
  const [data, setData] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    const { data: rows } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    setData((rows ?? []) as Subscription[])
    setLoading(false)
  }, [user])

  useEffect(() => { void fetch() }, [fetch])

  // Realtime
  useEffect(() => {
    if (!user) return
    const ch = supabase
      .channel(`subs:${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => void fetch())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, fetch])

  const create = useCallback(async (sub: NewSubscription) => {
    if (!user) return
    const optimistic: Subscription = {
      ...sub,
      id: crypto.randomUUID(),
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setData((prev) => [...prev, optimistic])
    const { data: row, error } = await supabase
      .from('subscriptions')
      .insert({ ...sub, user_id: user.id })
      .select()
      .single()
    if (error) { setData((prev) => prev.filter((s) => s.id !== optimistic.id)); return }
    setData((prev) => prev.map((s) => (s.id === optimistic.id ? (row as Subscription) : s)))
  }, [user])

  const update = useCallback(async (id: string, patch: SubscriptionPatch) => {
    setData((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    await supabase.from('subscriptions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }, [])

  const remove = useCallback(async (id: string) => {
    setData((prev) => prev.filter((s) => s.id !== id))
    await supabase.from('subscriptions').delete().eq('id', id)
  }, [])

  /** Normalize any subscription amount to monthly equivalent */
  function toMonthly(sub: Subscription): number {
    if (sub.frequency === 'anual') return sub.amount / 12
    if (sub.frequency === 'trimestral') return sub.amount / 3
    return sub.amount
  }

  const totalMonthly = data.filter((s) => s.active).reduce((sum, s) => sum + toMonthly(s), 0)

  return { data, loading, create, update, remove, totalMonthly, toMonthly }
}
