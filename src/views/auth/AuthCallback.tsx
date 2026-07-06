import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * Magic link return target. The supabase-js client auto-detects the token in
 * the URL and fires onAuthStateChange; we just wait for the session to
 * resolve, then redirect. A pending group invitation stashed by
 * /invite/:token (user was logged out) takes priority over the home route.
 */
export function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
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
  }, [session, loading, navigate])

  return (
    <main className="flex min-h-svh items-center justify-center bg-bg-secondary">
      <p className="text-sm text-text-secondary">Iniciando sesión…</p>
    </main>
  )
}
