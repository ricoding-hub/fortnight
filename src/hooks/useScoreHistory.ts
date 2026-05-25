import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ScoreBreakdown } from '@/lib/score'
import type { ScoreSnapshot } from '@/types'

/** Threshold below which a score change is treated as noise. */
const RECORD_EPSILON = 0.1

/** How many days of history to fetch for the sparkline. */
const WINDOW_DAYS = 30

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Daily score snapshots for the home sparkline. Reads the last 30 days and
 * exposes `recordIfChanged` so the consumer can upsert today's row when the
 * live score moves by more than 0.1 from the most recent snapshot.
 */
export function useScoreHistory() {
  const { user } = useAuth()
  const [snapshots, setSnapshots] = useState<ScoreSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [channelKey] = useState(() => crypto.randomUUID())
  const lastRecordedRef = useRef<{ day: string; score: number } | null>(null)

  const fetchHistory = useCallback(async () => {
    if (!user) return
    const { data: rows } = await supabase
      .from('score_history')
      .select('*')
      .eq('user_id', user.id)
      .order('day', { ascending: false })
      .limit(WINDOW_DAYS)
    const list = (rows ?? []) as ScoreSnapshot[]
    setSnapshots(list)
    const latest = list[0]
    if (latest) {
      lastRecordedRef.current = { day: latest.day, score: Number(latest.score) }
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHistory()

    const channel = supabase
      .channel(`score_history:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'score_history',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchHistory(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchHistory])

  const recordIfChanged = useCallback(
    async (score: number, breakdown?: ScoreBreakdown) => {
      if (!user) return
      const day = todayISO()
      const last = lastRecordedRef.current
      if (last && last.day === day && Math.abs(last.score - score) < RECORD_EPSILON) {
        return
      }
      lastRecordedRef.current = { day, score }
      const payload = {
        user_id: user.id,
        day,
        score,
        utilization: breakdown?.utilization ?? null,
        liquidity: breakdown?.liquidity ?? null,
        savings_rate: breakdown?.savingsRate ?? null,
        budget_adherence: breakdown?.budgetAdherence ?? null,
        recorded_at: new Date().toISOString(),
      }
      await supabase
        .from('score_history')
        .upsert(payload, { onConflict: 'user_id,day' })
    },
    [user],
  )

  return {
    snapshots,
    loading: user ? loading : false,
    recordIfChanged,
  }
}
