import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Profile } from '@/types'

/**
 * Lo último que se supo del perfil, compartido entre instancias y guardado en
 * el navegador. Antes cada pantalla lo pedía de cero y mientras llegaba se
 * mostraba la foto de Google; luego cambiaba a la que subiste: la imagen
 * «cargaba dos veces».
 */
const cache = new Map<string, Profile | null>()
const clave = (uid: string) => `fortnight:perfil:${uid}`

function guardado(uid: string): Profile | null | undefined {
  if (cache.has(uid)) return cache.get(uid)
  try {
    const crudo = window.localStorage.getItem(clave(uid))
    return crudo ? (JSON.parse(crudo) as Profile) : undefined
  } catch {
    return undefined
  }
}

function guardar(uid: string, p: Profile | null) {
  cache.set(uid, p)
  try {
    if (p) window.localStorage.setItem(clave(uid), JSON.stringify({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }))
  } catch {
    // sin almacenamiento, sólo la caché de esta sesión
  }
}

/**
 * The current user's public profile — the SINGLE source of the display name
 * and avatar used across the app (Home, Perfil, préstamos, grupos). The
 * nickname is dual-written to auth metadata (so the user's own views read it)
 * AND to profiles.display_name (so connected co-members see it too).
 */
export function useProfile() {
  const { user } = useAuth()
  const previo = user ? guardado(user.id) : undefined
  const [profile, setProfile] = useState<Profile | null>(previo ?? null)
  // ¿Ya se sabe (de la base, o de antes) si el perfil tiene foto propia?
  const [conocido, setConocido] = useState(previo !== undefined)
  const [loading, setLoading] = useState(true)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchProfile = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    const p = (data as Profile | null) ?? null
    guardar(user.id, p)
    setProfile(p)
    setConocido(true)
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
  // La foto de Google sólo si el perfil no tiene una propia, y sólo cuando ya
  // se sabe: mientras tanto, las iniciales (nunca una foto que luego cambia).
  const avatarUrl = profile?.avatar_url ?? (conocido ? metaAvatar : undefined)

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
