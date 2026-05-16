import { useCallback, useEffect, useRef, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCategories } from '@/hooks/useCategories'
import { DEFAULT_BUCKETS_SEED, PRESETS } from '@/lib/plan'
import type {
  BucketWithItems,
  BudgetItem,
  BudgetPlan,
  PlanPreset,
} from '@/types'

interface PlanData {
  plan: BudgetPlan
  buckets: BucketWithItems[]
}

/**
 * Returns the user's budget plan with its bucket/item children.
 *
 * First-render seeding: if the user has no `budget_plans` row, this hook
 * creates one with the 50/30/20 default + buckets + items, linking each item
 * to the user's same-named category when present. Seeding is guarded by a
 * ref so React 19's double-render in dev never duplicates the plan.
 */
export function useBudgetPlan() {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | Error | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())
  const seedingRef = useRef(false)

  const fetchPlan = useCallback(async (): Promise<void> => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('budget_plans')
      .select('*, budget_buckets(*, budget_items(*))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
    if (err) {
      setError(err)
      setLoading(false)
      return
    }
    const row = rows?.[0] as
      | (BudgetPlan & { budget_buckets: (BucketWithItems & { budget_items: BudgetItem[] })[] })
      | undefined
    if (!row) {
      // No plan yet — let the seed effect handle it.
      setData(null)
    } else {
      const buckets: BucketWithItems[] = (row.budget_buckets ?? [])
        .map((b) => ({
          id: b.id,
          plan_id: b.plan_id,
          slug: b.slug,
          name: b.name,
          pct: Number(b.pct),
          color: b.color,
          soft_color: b.soft_color,
          sort_order: b.sort_order,
          items: (b.budget_items ?? [])
            .map((it) => ({
              id: it.id,
              bucket_id: it.bucket_id,
              slug: it.slug,
              name: it.name,
              pct: Number(it.pct),
              category_id: it.category_id,
              icon: it.icon,
              sort_order: it.sort_order,
            }))
            .sort((a, b) => a.sort_order - b.sort_order),
        }))
        .sort((a, b) => a.sort_order - b.sort_order)
      setData({
        plan: {
          id: row.id,
          user_id: row.user_id,
          preset: row.preset,
          updated_at: row.updated_at,
          created_at: row.created_at,
        },
        buckets,
      })
      setError(null)
    }
    setLoading(false)
  }, [user])

  const seed = useCallback(async (): Promise<void> => {
    if (!user || seedingRef.current) return
    seedingRef.current = true
    try {
      const { data: planRow, error: planErr } = await supabase
        .from('budget_plans')
        .insert({ user_id: user.id, preset: '50-30-20' })
        .select('*')
        .single()
      if (planErr || !planRow) throw planErr ?? new Error('No plan returned from insert')

      const categoryByName = new Map(
        categories.map((c) => [c.name.toLowerCase(), c.id]),
      )

      for (const b of DEFAULT_BUCKETS_SEED) {
        const { data: bucketRow, error: bErr } = await supabase
          .from('budget_buckets')
          .insert({
            plan_id: planRow.id,
            slug: b.slug,
            name: b.name,
            pct: b.pct,
            color: b.color,
            soft_color: b.soft_color,
            sort_order: b.sort_order,
          })
          .select('id')
          .single()
        if (bErr || !bucketRow) throw bErr ?? new Error('No bucket returned')

        const items = b.items.map((it) => ({
          bucket_id: bucketRow.id,
          slug: it.slug,
          name: it.name,
          pct: it.pct,
          category_id: it.category_name
            ? categoryByName.get(it.category_name.toLowerCase()) ?? null
            : null,
          icon: it.icon,
          sort_order: it.sort_order,
        }))
        const { error: itErr } = await supabase.from('budget_items').insert(items)
        if (itErr) throw itErr
      }
      await fetchPlan()
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      seedingRef.current = false
    }
  }, [user, categories, fetchPlan])

  useEffect(() => {
    if (!user) return
    // fetchPlan only calls setState after an await — not a synchronous effect setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPlan()

    const channel = supabase
      .channel(`budget_plans:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budget_plans', filter: `user_id=eq.${user.id}` },
        () => void fetchPlan(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budget_buckets' },
        () => void fetchPlan(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budget_items' },
        () => void fetchPlan(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchPlan])

  // Seed once when we know there's no plan and we have categories loaded.
  useEffect(() => {
    if (!user || loading || data !== null) return
    if (seedingRef.current) return
    if (categories.length === 0) return
    // seed() awaits before calling setState — same async pattern as other hooks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void seed()
  }, [user, loading, data, categories, seed])

  /**
   * Update a single budget_item's pct. Optimistically updates local state then
   * recomputes the parent bucket's pct as sum of its items.
   */
  async function updateItemPct(itemId: string, nextPct: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(nextPct)))
    setData((prev) => {
      if (!prev) return prev
      const buckets = prev.buckets.map((b) => {
        if (!b.items.some((it) => it.id === itemId)) return b
        const items = b.items.map((it) =>
          it.id === itemId ? { ...it, pct: clamped } : it,
        )
        const bucketPct = items.reduce((s, it) => s + it.pct, 0)
        return { ...b, pct: bucketPct, items }
      })
      return { ...prev, buckets }
    })

    const { error: itErr } = await supabase
      .from('budget_items')
      .update({ pct: clamped })
      .eq('id', itemId)
    if (itErr) throw itErr

    // Recompute and persist bucket pct
    const next = data?.buckets.find((b) => b.items.some((it) => it.id === itemId))
    if (next) {
      const items = next.items.map((it) =>
        it.id === itemId ? { ...it, pct: clamped } : it,
      )
      const bucketPct = items.reduce((s, it) => s + it.pct, 0)
      await supabase
        .from('budget_buckets')
        .update({ pct: bucketPct })
        .eq('id', next.id)
    }
  }

  /**
   * Apply a preset — scales each bucket and proportionally scales items.
   * Persists in batched updates.
   */
  async function applyPlanPreset(preset: PlanPreset) {
    if (!data) return
    const values = PRESETS[preset].values
    const nextBuckets = data.buckets.map((b, i) => {
      const nextPct = values[i] ?? b.pct
      const scale = b.pct > 0 ? nextPct / b.pct : 1
      const items = b.items.map((it) => ({ ...it, pct: Math.round(it.pct * scale) }))
      return { ...b, pct: nextPct, items }
    })

    // Optimistic
    setData({ ...data, buckets: nextBuckets, plan: { ...data.plan, preset } })

    // Persist plan preset
    const { error: pErr } = await supabase
      .from('budget_plans')
      .update({ preset, updated_at: new Date().toISOString() })
      .eq('id', data.plan.id)
    if (pErr) throw pErr

    // Persist bucket + item pcts
    await Promise.all(
      nextBuckets.flatMap((b) => [
        supabase.from('budget_buckets').update({ pct: b.pct }).eq('id', b.id),
        ...b.items.map((it) =>
          supabase.from('budget_items').update({ pct: it.pct }).eq('id', it.id),
        ),
      ]),
    )
  }

  return {
    data,
    loading: loading || (data === null && !error),
    error,
    updateItemPct,
    applyPlanPreset,
    refetch: fetchPlan,
  }
}
