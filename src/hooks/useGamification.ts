import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { UserGamification } from '@/types'

export const XP_PER_TX = 15

/** XP threshold for each level (index = level - 1). Level 6+ is open-ended. */
export const LEVEL_XP = [0, 100, 250, 500, 900, 1500] as const

function xpToLevel(xp: number): number {
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP[i]) return i + 1
  }
  return 1
}

function nextLevelXP(level: number): number {
  return LEVEL_XP[level] ?? LEVEL_XP[LEVEL_XP.length - 1] * 2
}


const EMPTY: UserGamification = {
  user_id: '',
  xp: 0,
  level: 1,
  streak_days: 0,
  last_activity_date: null,
  updated_at: new Date().toISOString(),
}

export function useGamification() {
  const { user } = useAuth()
  const [data, setData] = useState<UserGamification>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [channelKey] = useState(() => crypto.randomUUID())
  const seededRef = useRef(false)

  const seed = useCallback(async () => {
    if (!user) return
    if (!seededRef.current) {
      seededRef.current = true
      // Idempotent: never overwrites an existing row (a blind insert used to
      // race the XP trigger's own insert and could pin xp at 0).
      const { error: seedErr } = await supabase
        .from('user_gamification')
        .upsert(
          { user_id: user.id, xp: 0, level: 1, streak_days: 0, last_activity_date: null },
          { onConflict: 'user_id', ignoreDuplicates: true },
        )
      if (seedErr) console.error('gamification seed failed', seedErr)
    }
    const { data: fresh } = await supabase
      .from('user_gamification')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (fresh) setData(fresh as UserGamification)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void seed()
  }, [seed])

  // Realtime subscription. The XP trigger fires inside a SECURITY DEFINER
  // function, so realtime only reaches us if user_gamification is in the
  // supabase_realtime publication (added in migration 011).
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`gami:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_gamification', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            setData(payload.new as UserGamification)
          } else {
            // Fallback: re-fetch if payload shape is unexpected
            void seed()
          }
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user, channelKey, seed])

  const addXP = useCallback(async (amount: number) => {
    if (!user) return
    // Optimistic bump for snappy UI; the source of truth is the atomic RPC.
    setData((prev) => ({
      ...prev,
      xp: prev.xp + amount,
      level: xpToLevel(prev.xp + amount),
    }))

    // Atomic server-side increment (migration 025). The old absolute UPDATE
    // computed from a stale local snapshot could clobber XP the transaction
    // trigger had just awarded — the "XP keeps resetting" bug.
    const { data: fresh, error } = await supabase.rpc('add_xp', { p_amount: amount })
    if (!error && fresh) {
      setData(fresh as UserGamification)
    } else if (error) {
      // Pre-025 fallback or transient failure: refetch to reconcile.
      void seed()
    }
  }, [user, seed])

  const lv = data.level
  const nextXP = nextLevelXP(lv)
  const prevXP = LEVEL_XP[lv - 1] ?? 0
  const levelProgress = nextXP > prevXP ? (data.xp - prevXP) / (nextXP - prevXP) : 1

  return {
    data,
    loading: user ? loading : false,
    addXP,
    refetch: seed,
    nextLevelXP: nextXP,
    levelProgress,
  }
}
