import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * Magic link return target. The supabase-js client auto-detects the token in
 * the URL and fires onAuthStateChange; we just wait for the session to
 * resolve, then redirect.
 */
export function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    navigate(session ? '/' : '/login', { replace: true })
  }, [session, loading, navigate])

  return (
    <main className="flex min-h-svh items-center justify-center bg-bg-secondary">
      <p className="text-sm text-[#6b6375]">Iniciando sesión…</p>
    </main>
  )
}
