import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

/**
 * /invite/:token — consumes a group invitation link.
 *
 * Logged in → POST /api/split/accept and land on the group.
 * Logged out → stash the token (AuthCallback consumes it post-login)
 * and go to /login.
 */
export function InviteRedirect() {
  const { token } = useParams<{ token: string }>()
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const firedRef = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading || !token || firedRef.current) return

    if (!session) {
      localStorage.setItem('fortnight_pending_invite', token)
      navigate('/login', { replace: true })
      return
    }

    firedRef.current = true
    localStorage.removeItem('fortnight_pending_invite')

    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const jwt = sessionData.session?.access_token
        const res = await fetch('/api/split/accept', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ token, action: 'accept' }),
        })
        const payload = (await res.json().catch(() => ({}))) as { groupId?: string; error?: string }
        if (res.ok && payload.groupId) {
          navigate(`/cuentas/prestamos/${payload.groupId}`, { replace: true })
        } else if (payload.error === 'invite_not_pending') {
          setError('Esta invitación ya fue usada o revocada.')
        } else {
          setError('No se pudo aceptar la invitación. Pide que te reenvíen el enlace.')
        }
      } catch {
        setError('No se pudo aceptar la invitación. Revisa tu conexión e inténtalo de nuevo.')
      }
    })()
  }, [loading, session, token, navigate])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-bg-secondary px-8 text-center">
      {error ? (
        <>
          <p className="text-sm font-semibold text-text">{error}</p>
          <button
            type="button"
            onClick={() => void navigate('/', { replace: true })}
            className="text-sm font-bold text-primary"
          >
            Ir al inicio
          </button>
        </>
      ) : (
        <p className="text-sm text-text-secondary">Aceptando invitación…</p>
      )}
    </main>
  )
}
