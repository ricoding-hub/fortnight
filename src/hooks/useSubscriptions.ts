import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { subMonthlyAmount } from '@/lib/projections'
import { useTableChannel } from '@/hooks/useTableChannel'
import { useAuth } from '@/hooks/useAuth'
import type { Subscription, NewSubscription, SubscriptionPatch } from '@/types'

/**
 * `numeric` de Postgres llega como CADENA por PostgREST.
 *
 * Sin esto `suma + sub.amount` concatena en vez de sumar, y dos suscripciones
 * de 299 y 199 daban "0299199". Pasaba sólo en el caso mensual, que es el
 * común: anual y trimestral se salvaban porque dividir sí convierte. Los demás
 * hooks ya normalizaban al traer; este no.
 */
function normalizar(row: unknown): Subscription {
  const r = row as Subscription
  return {
    ...r,
    amount: Number(r.amount),
    charge_day: Number(r.charge_day),
    kind: r.kind ?? 'suscripcion',
  }
}

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
    setData((rows ?? []).map(normalizar))
    setLoading(false)
  }, [user])

  useEffect(() => { void fetch() }, [fetch])

  useTableChannel(
    'subs',
    user ? [{ table: 'subscriptions', filter: `user_id=eq.${user.id}` }] : null,
    () => void fetch(),
  )

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
    setData((prev) => prev.map((s) => (s.id === optimistic.id ? normalizar(row) : s)))
  }, [user])

  const update = useCallback(async (id: string, patch: SubscriptionPatch) => {
    setData((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    await supabase.from('subscriptions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }, [])

  const remove = useCallback(async (id: string) => {
    setData((prev) => prev.filter((s) => s.id !== id))
    await supabase.from('subscriptions').delete().eq('id', id)
  }, [])

  /** Equivalente mensual. Una sola implementación, en lib/projections. */
  function toMonthly(sub: Subscription): number {
    return subMonthlyAmount(sub.amount, sub.frequency)
  }

  const totalMonthly = data.filter((s) => s.active).reduce((sum, s) => sum + toMonthly(s), 0)

  return { data, loading, create, update, remove, totalMonthly, toMonthly }
}
