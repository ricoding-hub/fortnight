import { useCallback, useEffect, useRef, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCategories } from '@/hooks/useCategories'
import { DEFAULT_BUCKETS_SEED, PRESETS, isNamedPreset, type NamedPreset } from '@/lib/plan'
import type {
  BucketWithItems,
  BudgetItem,
  BudgetPlan,
  PersonalSnapshot,
  PlanPreset,
} from '@/types'

interface PlanData {
  plan: BudgetPlan
  buckets: BucketWithItems[]
}

/** Serialize the current buckets/items into the personal_snapshot JSON shape. */
function snapshotFromBuckets(buckets: BucketWithItems[]): PersonalSnapshot {
  return {
    buckets: buckets.map((b) => ({
      slug: b.slug,
      pct: b.pct,
      items: b.items.map((it) => ({ slug: it.slug, pct: it.pct })),
    })),
  }
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
      const planRow = row as unknown as BudgetPlan & {
        personal_name?: string | null
        personal_snapshot?: PersonalSnapshot | null
      }
      setData({
        plan: {
          id: row.id,
          user_id: row.user_id,
          preset: row.preset,
          updated_at: row.updated_at,
          created_at: row.created_at,
          personal_name: planRow.personal_name ?? 'Personalizado',
          personal_snapshot: planRow.personal_snapshot ?? null,
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
   * recomputes the parent bucket's pct as sum of its items. When the plan is
   * on a named preset (e.g. 50-30-20), the first edit promotes the plan to
   * the 'personal' preset and snapshots the new state, so subsequent preset
   * switches can restore the user's customisations.
   */
  async function updateItemPct(itemId: string, nextPct: number) {
    if (!data) return
    const clamped = Math.max(0, Math.min(100, Math.round(nextPct)))
    const wasNamed = isNamedPreset(data.plan.preset)

    const nextBuckets = data.buckets.map((b) => {
      if (!b.items.some((it) => it.id === itemId)) return b
      const items = b.items.map((it) =>
        it.id === itemId ? { ...it, pct: clamped } : it,
      )
      const bucketPct = items.reduce((s, it) => s + it.pct, 0)
      return { ...b, pct: bucketPct, items }
    })

    const snapshot = snapshotFromBuckets(nextBuckets)

    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        buckets: nextBuckets,
        plan: wasNamed
          ? { ...prev.plan, preset: 'personal', personal_snapshot: snapshot }
          : { ...prev.plan, personal_snapshot: snapshot },
      }
    })

    const changedBucket = nextBuckets.find((b) => b.items.some((it) => it.id === itemId))!

    const { error: itErr } = await supabase
      .from('budget_items')
      .update({ pct: clamped })
      .eq('id', itemId)
    if (itErr) throw itErr

    await supabase
      .from('budget_buckets')
      .update({ pct: changedBucket.pct })
      .eq('id', changedBucket.id)

    // Promote to 'personal' on first edit; always refresh the snapshot.
    await supabase
      .from('budget_plans')
      .update({
        preset: wasNamed ? 'personal' : data.plan.preset,
        personal_snapshot: snapshot,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.plan.id)
  }

  /**
   * Apply a preset. For named presets (50/30/20 etc) it scales the live
   * buckets/items as before. For 'personal' it restores from the stored
   * snapshot. Either way the personal_snapshot row is preserved so the user
   * can always return to their custom plan.
   */
  async function applyPlanPreset(preset: PlanPreset) {
    if (!data) return

    if (preset === 'personal') {
      const snap = data.plan.personal_snapshot
      if (!snap) return  // nothing to restore
      const nextBuckets = data.buckets.map((b) => {
        const snapBucket = snap.buckets.find((sb) => sb.slug === b.slug)
        if (!snapBucket) return b
        const items = b.items.map((it) => {
          const snapItem = snapBucket.items.find((si) => si.slug === it.slug)
          return snapItem ? { ...it, pct: snapItem.pct } : it
        })
        return { ...b, pct: snapBucket.pct, items }
      })

      setData({
        ...data,
        buckets: nextBuckets,
        plan: { ...data.plan, preset: 'personal' },
      })

      await supabase
        .from('budget_plans')
        .update({ preset: 'personal', updated_at: new Date().toISOString() })
        .eq('id', data.plan.id)

      await Promise.all(
        nextBuckets.flatMap((b) => [
          supabase.from('budget_buckets').update({ pct: b.pct }).eq('id', b.id),
          ...b.items.map((it) =>
            supabase.from('budget_items').update({ pct: it.pct }).eq('id', it.id),
          ),
        ]),
      )
      return
    }

    // Named preset path — scale and persist as before. personal_snapshot stays untouched.
    if (!isNamedPreset(preset)) return
    const values = PRESETS[preset as NamedPreset].values
    const nextBuckets = data.buckets.map((b, i) => {
      const nextPct = values[i] ?? b.pct
      const scale = b.pct > 0 ? nextPct / b.pct : 1
      const items = b.items.map((it) => ({ ...it, pct: Math.round(it.pct * scale) }))
      return { ...b, pct: nextPct, items }
    })

    setData({ ...data, buckets: nextBuckets, plan: { ...data.plan, preset } })

    const { error: pErr } = await supabase
      .from('budget_plans')
      .update({ preset, updated_at: new Date().toISOString() })
      .eq('id', data.plan.id)
    if (pErr) throw pErr

    await Promise.all(
      nextBuckets.flatMap((b) => [
        supabase.from('budget_buckets').update({ pct: b.pct }).eq('id', b.id),
        ...b.items.map((it) =>
          supabase.from('budget_items').update({ pct: it.pct }).eq('id', it.id),
        ),
      ]),
    )
  }

  /** Rename the user's personal preset. */
  async function renamePersonalPreset(name: string) {
    if (!data) return
    const trimmed = name.trim() || 'Personalizado'
    setData({ ...data, plan: { ...data.plan, personal_name: trimmed } })
    await supabase
      .from('budget_plans')
      .update({ personal_name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', data.plan.id)
  }

  return {
    data,
    loading: loading || (data === null && !error),
    error,
    updateItemPct,
    applyPlanPreset,
    renamePersonalPreset,
    refetch: fetchPlan,
  }
}
