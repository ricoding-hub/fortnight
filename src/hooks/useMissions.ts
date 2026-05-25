import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useGamification } from '@/hooks/useGamification'
import { useToast } from '@/hooks/useToast'
import {
  MISSION_CATALOG,
  isoWeek,
  type MissionContext,
  type MissionDef,
} from '@/lib/missions'

export interface MissionView extends Omit<MissionDef, 'progress'> {
  current: number
  total: number
  done: boolean
  claimed: boolean
}

/**
 * Drives the home-screen Misiones surface. Computes per-mission progress from
 * the live `ctx`, fetches which missions are already claimed for the current
 * ISO week, and auto-claims any mission that just hit 100% (one INSERT per
 * mission per week thanks to the unique constraint on mission_completions).
 */
export function useMissions(ctx: MissionContext) {
  const { user } = useAuth()
  const { addXP } = useGamification()
  const toast = useToast()
  const [claimed, setClaimed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const cycleWeek = isoWeek()
  const claimingRef = useRef<Set<string>>(new Set())

  const fetchClaimed = useCallback(async () => {
    if (!user) return
    const { data: rows } = await supabase
      .from('mission_completions')
      .select('mission_id')
      .eq('user_id', user.id)
      .eq('cycle_week', cycleWeek)
    setClaimed(new Set((rows ?? []).map((r) => r.mission_id as string)))
    setLoading(false)
  }, [user, cycleWeek])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchClaimed()
    const ch = supabase
      .channel(`missions:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mission_completions',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchClaimed(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [user, fetchClaimed])

  const claim = useCallback(
    async (mission: { id: string; reward: number; title: string }) => {
      if (!user) return
      if (claimed.has(mission.id) || claimingRef.current.has(mission.id)) return
      claimingRef.current.add(mission.id)
      // Optimistic local mark so the UI doesn't keep re-triggering the effect.
      setClaimed((prev) => new Set(prev).add(mission.id))
      const { error: err } = await supabase
        .from('mission_completions')
        .insert({
          user_id: user.id,
          mission_id: mission.id,
          cycle_week: cycleWeek,
          reward_xp: mission.reward,
        })
      claimingRef.current.delete(mission.id)
      // 23505 = unique_violation — already claimed (race with another tab).
      // Treat as a no-op; the realtime fetch will reconcile.
      if (err && err.code !== '23505') {
        setClaimed((prev) => {
          const next = new Set(prev)
          next.delete(mission.id)
          return next
        })
        return
      }
      if (!err) {
        await addXP(mission.reward)
        toast.success(`+${mission.reward} XP`, mission.title)
      }
    },
    [user, claimed, cycleWeek, addXP, toast],
  )

  const missions: MissionView[] = MISSION_CATALOG.map((m) => {
    const { current, total } = m.progress(ctx)
    const done = total > 0 && current >= total
    // Drop the function-typed `progress` so the view is plain data.
    const { progress: _p, ...rest } = m
    void _p
    return {
      ...rest,
      current,
      total,
      done,
      claimed: claimed.has(m.id),
    }
  })

  // Auto-claim every mission whose bar just hit 100%. Effect re-runs whenever
  // ctx changes, so toggling a balance / hitting the threshold immediately
  // triggers the claim.
  useEffect(() => {
    if (loading || !user) return
    for (const m of missions) {
      if (m.done && !m.claimed) {
        void claim(m)
      }
    }
    // claim is stable enough; we want to re-check missions on every ctx change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.weekTxCount, ctx.score, ctx.weekDebtPayments, loading, user])

  return {
    missions,
    claimed,
    cycleWeek,
    loading: user ? loading : false,
  }
}
