import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Profile } from '@/types'

/**
 * The current user's public profile — the SINGLE source of the display name
 * and avatar used across the app (Home, Perfil, préstamos, grupos). The
 * nickname is dual-written to auth metadata (so the user's own views read it)
 * AND to profiles.display_name (so connected co-members see it too).
 */
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchProfile = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    setProfile((data as Profile | null) ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProfile()
    const channel = supabase
      .channel(`profile:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => void fetchProfile(),
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user, channelKey, fetchProfile])

  const metaName = user?.user_metadata?.full_name as string | undefined
  const metaAvatar = user?.user_metadata?.avatar_url as string | undefined

  // Cascade: nickname wins, then auth metadata, then email local-part.
  const displayName =
    profile?.display_name ?? metaName ?? user?.email?.split('@')[0] ?? 'amigo'
  const avatarUrl = profile?.avatar_url ?? metaAvatar

  /** Set the nickname everywhere (auth metadata + public profile). */
  const updateNickname = useCallback(
    async (name: string) => {
      if (!user) return
      const trimmed = name.trim()
      // Optimistic so Home/Perfil update instantly.
      setProfile((prev) =>
        prev
          ? { ...prev, display_name: trimmed || null }
          : ({ id: user.id, display_name: trimmed || null, avatar_url: metaAvatar ?? null, email: user.email ?? '', created_at: '' } as Profile),
      )
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { full_name: trimmed || null },
      })
      if (metaErr) throw metaErr
      await supabase.from('profiles').update({ display_name: trimmed || null }).eq('id', user.id)
    },
    [user, metaAvatar],
  )

  return {
    profile,
    loading: user ? loading : false,
    displayName,
    avatarUrl,
    updateNickname,
    refetch: fetchProfile,
  }
}
