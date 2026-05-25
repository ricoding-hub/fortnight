import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Tracks which budget items the user has marked as "paid this cycle".
 * Cycle = calendar month ('YYYY-MM'). Toggle inserts or deletes the row.
 */
export function useBudgetCompletions() {
  const { user } = useAuth()
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const cycleMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const fetch = useCallback(async () => {
    if (!user) return
    const { data: rows } = await supabase
      .from('budget_item_completions')
      .select('item_id')
      .eq('user_id', user.id)
      .eq('cycle_month', cycleMonth)
    setCompleted(new Set((rows ?? []).map((r) => r.item_id as string)))
    setLoading(false)
  }, [user, cycleMonth])

  useEffect(() => { void fetch() }, [fetch])

  // Realtime
  useEffect(() => {
    if (!user) return
    const ch = supabase
      .channel(`completions:${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'budget_item_completions',
        filter: `user_id=eq.${user.id}`,
      }, () => void fetch())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, fetch])

  const toggle = useCallback(async (itemId: string) => {
    if (!user) return
    const isCompleted = completed.has(itemId)
    // Optimistic update
    setCompleted((prev) => {
      const next = new Set(prev)
      if (isCompleted) next.delete(itemId)
      else next.add(itemId)
      return next
    })
    if (isCompleted) {
      await supabase
        .from('budget_item_completions')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .eq('cycle_month', cycleMonth)
    } else {
      await supabase
        .from('budget_item_completions')
        .insert({ user_id: user.id, item_id: itemId, cycle_month: cycleMonth })
    }
  }, [user, completed, cycleMonth])

  return { completed, toggle, loading, cycleMonth }
}
