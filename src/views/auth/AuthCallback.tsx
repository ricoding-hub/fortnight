import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'

/**
 * Magic link return target. The supabase-js client auto-detects the token in
 * the URL and fires onAuthStateChange; we just wait for the session to
 * resolve, then redirect. A pending group invitation stashed by
 * /invite/:token (user was logged out) takes priority over the home route.
 */
export function AuthCallback() {
  const { session, loading, isRecovery } = useAuth()
  const navigate = useNavigate()
  // Supabase deja el fallo en el hash: sin esto un enlace vencido redirigía a
  // /login sin decir nada y el usuario no sabía por qué no entró.
  const [errorEnlace] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const busca = new URLSearchParams(window.location.search)
    return hash.get('error_description') ?? busca.get('error_description') ?? hash.get('error') ?? null
  })

  useEffect(() => {
    if (loading) return
    if (errorEnlace) return
    // Un enlace de recuperación abre sesión: hay que llevarlo a elegir
    // contraseña, no a Inicio.
    if (isRecovery) {
      navigate('/auth/reset', { replace: true })
      return
    }
    if (session) {
      const pendingJoin = localStorage.getItem('fortnight_pending_join')
      if (pendingJoin) {
        navigate(`/join/${pendingJoin}`, { replace: true })
        return
      }
      const pendingInvite = localStorage.getItem('fortnight_pending_invite')
      if (pendingInvite) {
        navigate(`/invite/${pendingInvite}`, { replace: true })
        return
      }
    }
    navigate(session ? '/' : '/login', { replace: true })
  }, [session, loading, navigate, isRecovery, errorEnlace])

  if (errorEnlace) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-peach-soft">
          <IconAlertTriangle size={22} className="text-peach-deep" />
        </div>
        <div className="max-w-[32ch]">
          <p className="text-sm font-semibold text-text">No pudimos abrir tu sesión</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
            Ese enlace ya venció o se usó antes. Los enlaces de acceso duran una
            hora y sirven una sola vez.
          </p>
        </div>
        <Link
          to="/login"
          className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-white transition-transform active:scale-[0.98]"
        >
          Volver a entrar
        </Link>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-bg-secondary">
      <p className="text-sm text-text-secondary">Iniciando sesión…</p>
    </main>
  )
}
