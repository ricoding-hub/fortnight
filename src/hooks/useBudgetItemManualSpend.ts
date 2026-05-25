import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Per-item manual real-spend overrides for the current calendar month.
 * When present, the override replaces the transaction-derived spent value
 * shown in the budget UI. Used when the user couldn't log transactions
 * but knows the real amount they spent on a category.
 */
export function useBudgetItemManualSpend() {
  const { user } = useAuth()
  const [data, setData] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const cycleMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const fetchAll = useCallback(async () => {
    if (!user) return
    const { data: rows } = await supabase
      .from('budget_item_manual_spend')
      .select('item_id, amount')
      .eq('user_id', user.id)
      .eq('cycle_month', cycleMonth)
    const next = new Map<string, number>()
    for (const r of rows ?? []) next.set(r.item_id as string, Number(r.amount))
    setData(next)
    setLoading(false)
  }, [user, cycleMonth])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!user) return
    const ch = supabase
      .channel(`manual_spend:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_item_manual_spend',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchAll(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [user, fetchAll])

  const setManual = useCallback(
    async (itemId: string, amount: number) => {
      if (!user) return
      const clean = Math.max(0, Math.round(amount * 100) / 100)
      setData((prev) => {
        const next = new Map(prev)
        next.set(itemId, clean)
        return next
      })
      await supabase
        .from('budget_item_manual_spend')
        .upsert(
          {
            user_id: user.id,
            item_id: itemId,
            cycle_month: cycleMonth,
            amount: clean,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,item_id,cycle_month' },
        )
    },
    [user, cycleMonth],
  )

  const clearManual = useCallback(
    async (itemId: string) => {
      if (!user) return
      setData((prev) => {
        const next = new Map(prev)
        next.delete(itemId)
        return next
      })
      await supabase
        .from('budget_item_manual_spend')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .eq('cycle_month', cycleMonth)
    },
    [user, cycleMonth],
  )

  return { data, loading, setManual, clearManual, cycleMonth }
}
