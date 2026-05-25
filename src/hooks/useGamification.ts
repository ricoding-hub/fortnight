import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { UserGamification } from '@/types'

const XP_PER_TX = 15

/** XP threshold for each level (index = level - 1). Level 5+ is open-ended. */
const LEVEL_XP = [0, 500, 1500, 3500, 7000] as const

function xpToLevel(xp: number): number {
  let lv = 1
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP[i]) { lv = i + 1; break }
  }
  return lv
}

function nextLevelXP(level: number): number {
  return LEVEL_XP[level] ?? LEVEL_XP[LEVEL_XP.length - 1] * 2
}

function computeStreak(current: number, lastDate: string | null): { streak: number; date: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (!lastDate) return { streak: 1, date: today }
  if (lastDate === today) return { streak: current, date: today }
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)
  if (lastDate === yStr) return { streak: current + 1, date: today }
  return { streak: 1, date: today }
}

const EMPTY: UserGamification = {
  user_id: '',
  xp: 0,
  level: 1,
  streak_days: 0,
  last_activity_date: null,
  updated_at: new Date().toISOString(),
}

export { XP_PER_TX }

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
      const { data: row } = await supabase
        .from('user_gamification')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!row) {
        await supabase.from('user_gamification').insert({
          user_id: user.id,
          xp: 0,
          level: 1,
          streak_days: 0,
          last_activity_date: null,
        })
      }
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

  // Keep a ref so addXP always reads the latest gamification state without
  // including `data` in the dependency array (avoids stale closure bug).
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data }, [data])

  const addXP = useCallback(async (amount: number) => {
    if (!user) return
    const current = dataRef.current
    const newXP = current.xp + amount
    const newLevel = xpToLevel(newXP)
    const { streak, date } = computeStreak(current.streak_days, current.last_activity_date)

    const patch: Partial<UserGamification> = {
      xp: newXP,
      level: newLevel,
      streak_days: streak,
      last_activity_date: date,
      updated_at: new Date().toISOString(),
    }

    // Optimistic update
    setData((prev) => ({ ...prev, ...patch }))

    try {
      await supabase
        .from('user_gamification')
        .upsert({ user_id: user.id, ...patch })
    } catch {
      // Revert on failure — next realtime event will correct state
    }
  }, [user])

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
