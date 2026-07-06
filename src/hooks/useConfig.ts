import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { UserConfig } from '@/types'

export type ConfigPatch = Partial<
  Omit<UserConfig, 'user_id' | 'updated_at'>
>

export function useConfig() {
  const { user } = useAuth()
  const [data, setData] = useState<UserConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchConfig = useCallback(async () => {
    if (!user) return
    const { data: row, error: err } = await supabase
      .from('user_config')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (err) setError(err)
    else {
      setError(null)
      setData((row as UserConfig | null) ?? null)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // fetchConfig only calls setState after an await — not a synchronous effect setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchConfig()

    const channel = supabase
      .channel(`user_config:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_config',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchConfig(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchConfig])

  /**
   * Updates the user_config row. Uses upsert so it still works if the
   * signup-seed trigger never ran (e.g. a pre-existing account).
   * Optimistic: local state reflects the write immediately, so a realtime
   * echo of an OLDER snapshot can no longer visually revert fresh edits.
   */
  async function update(patch: ConfigPatch) {
    if (!user) throw new Error('Not authenticated')
    const updatedAt = new Date().toISOString()
    const { error: err } = await supabase.from('user_config').upsert({
      user_id: user.id,
      ...patch,
      updated_at: updatedAt,
    })
    if (err) throw err
    setData((prev) =>
      prev
        ? { ...prev, ...patch, updated_at: updatedAt }
        : ({ user_id: user.id, ...patch, updated_at: updatedAt } as UserConfig),
    )
  }

  return {
    data: user ? data : null,
    loading: user ? loading : false,
    error,
    update,
  }
}
