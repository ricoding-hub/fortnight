import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ensureCacheOwner, purgeDataCache, rememberHadSession } from '@/lib/dataCache'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  /**
   * La sesión viene de un enlace de recuperación, no de un acceso normal.
   *
   * Importa porque `detectSessionInUrl` está activo: el enlace del correo abre
   * sesión de verdad, así que sin esta bandera el usuario aterrizaría en Inicio
   * como si nada y la pantalla de "elige tu nueva contraseña" no se vería jamás.
   */
  isRecovery: boolean
  signInWithEmail: (email: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ needsConfirmation: boolean }>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRecovery, setIsRecovery] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      rememberHadSession(!!data.session)
      void ensureCacheOwner(data.session?.user.id)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      // Supabase emite PASSWORD_RECOVERY al abrir el enlace del correo. La
      // sesión es real, así que hay que marcarla para no confundirla con un
      // acceso normal; se limpia al salir o al terminar el cambio.
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true)
      else if (event === 'SIGNED_OUT') setIsRecovery(false)
      // A different account on the same browser must never inherit the cached
      // reads of the previous one — they're indexed by URL, not by user.
      void ensureCacheOwner(nextSession?.user.id)
      if (nextSession) rememberHadSession(true)
      else if (event === 'SIGNED_OUT') rememberHadSession(false)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signInWithEmail(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw error
  }

  async function signUpWithPassword(email: string, password: string, fullName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // El disparador seed_user_data lo lee para profiles.display_name, así
        // que darlo aquí evita que la cuenta nazca llamándose como el correo.
        data: fullName?.trim() ? { full_name: fullName.trim() } : undefined,
      },
    })
    if (error) throw error
    // Sin confirmación de correo Supabase devuelve sesión al instante; con
    // ella, `session` viene null y hay que mandar a revisar la bandeja.
    return { needsConfirmation: data.session == null }
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      // A /auth/reset y no a /auth/callback: callback manda a Inicio en cuanto
      // hay sesión, y el enlace de recuperación crea una.
      redirectTo: `${window.location.origin}/auth/reset`,
    })
    if (error) throw error
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    setIsRecovery(false)
    // Cambiar la contraseña tiene que expulsar a quien estuviera dentro con la
    // anterior. Si falla, la contraseña ya cambió: no vale la pena tumbar el
    // flujo por no haber podido cerrar las otras sesiones.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
  }

  async function signOut() {
    // Purge FIRST. This used to run after `throw error`, so signing out with no
    // network left every cached balance on the device — the exact case where
    // wiping matters most.
    await purgeDataCache()
    rememberHadSession(false)
    setIsRecovery(false)
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    isRecovery,
    signInWithEmail,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    updatePassword,
    signOut,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

// Provider + hook intentionally co-located in this file (see CLAUDE.md structure).
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
