import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconArrowRight, IconUserPlus, IconUsers } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

interface JoinPreview {
  groupId: string
  name: string
  alreadyMember: boolean
  members: Array<{ id: string; name: string; linked: boolean }>
}

/**
 * /join/:code — group invite link (Splitwise model).
 *
 * Logged out → stash the code, go to /login (AuthCallback returns here).
 * Logged in → preview the group, then either claim an unlinked member
 * slot ("Soy X") or join as a new person.
 */
export function JoinGroup() {
  const { code } = useParams<{ code: string }>()
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const previewFiredRef = useRef(false)

  const [preview, setPreview] = useState<JoinPreview | null>(null)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const callJoin = useCallback(
    async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const { data: sessionData } = await supabase.auth.getSession()
      const jwt = sessionData.session?.access_token
      const res = await fetch('/api/split/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ code, ...body }),
      })
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error((payload.error as string) ?? 'request_failed')
      return payload
    },
    [code],
  )

  useEffect(() => {
    if (loading || !code || previewFiredRef.current) return

    if (!session) {
      localStorage.setItem('fortnight_pending_join', code)
      navigate('/login', { replace: true })
      return
    }

    previewFiredRef.current = true
    localStorage.removeItem('fortnight_pending_join')

    void (async () => {
      try {
        const p = (await callJoin({ action: 'preview' })) as unknown as JoinPreview
        if (p.alreadyMember) {
          navigate(`/cuentas/prestamos/${p.groupId}`, { replace: true })
          return
        }
        setPreview(p)
        const defaultName =
          (session.user.user_metadata?.full_name as string | undefined) ??
          session.user.email?.split('@')[0] ??
          ''
        setNewName(defaultName)
      } catch (e) {
        setError(
          e instanceof Error && e.message === 'group_not_found'
            ? 'Este enlace de invitación no es válido o el grupo fue eliminado.'
            : 'No se pudo cargar la invitación. Revisa tu conexión e inténtalo de nuevo.',
        )
      }
    })()
  }, [loading, session, code, navigate, callJoin])

  async function join(body: Record<string, unknown>) {
    setSubmitting(true)
    setError('')
    try {
      const res = await callJoin(body)
      navigate(`/cuentas/prestamos/${res.groupId as string}`, { replace: true })
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'member_already_linked'
          ? 'Esa persona ya está vinculada a otra cuenta. Elige otra o únete como nueva persona.'
          : 'No se pudo completar la unión al grupo. Inténtalo de nuevo.',
      )
      setSubmitting(false)
    }
  }

  const claimable = preview?.members.filter((m) => !m.linked) ?? []

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg-secondary px-6 py-10">
      {error && !preview ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-text">{error}</p>
          <button
            type="button"
            onClick={() => void navigate('/', { replace: true })}
            className="text-sm font-bold text-primary"
          >
            Ir al inicio
          </button>
        </div>
      ) : !preview ? (
        <p className="text-sm text-[#6b6375]">Cargando invitación…</p>
      ) : (
        <div className="flex w-full max-w-[420px] flex-col gap-4">
          {/* Group header */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-deep">
              <IconUsers size={26} stroke={2} />
            </div>
            <h1 className="font-display text-[22px] font-bold leading-tight text-text">
              Te invitaron a "{preview.name}"
            </h1>
            <p className="text-[13px] text-text-secondary">
              {preview.members.length} personas comparten gastos aquí. ¿Quién eres tú?
            </p>
          </div>

          {/* Claimable slots */}
          {claimable.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl bg-bg-elevated p-4 shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                Ya estoy en el grupo
              </p>
              {claimable.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => void join({ action: 'claim', memberId: m.id })}
                  className="flex items-center gap-3 rounded-xl border border-border bg-bg px-4 py-3 text-left transition-all hover:border-primary/40 active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary-deep">
                    {(m.name[0] ?? '?').toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-text">
                    Soy {m.name}
                  </span>
                  <IconArrowRight size={16} className="shrink-0 text-text-tertiary" />
                </button>
              ))}
            </div>
          )}

          {/* Join as new person */}
          <div className="flex flex-col gap-2.5 rounded-2xl bg-bg-elevated p-4 shadow-card">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
              {claimable.length > 0 ? 'O soy alguien nuevo' : 'Únete al grupo'}
            </p>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-asset/10 text-asset-deep">
                <IconUserPlus size={17} stroke={2} />
              </span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-4 text-base text-text placeholder:text-text-tertiary transition-all focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            </div>
            <Button
              loading={submitting}
              disabled={!newName.trim()}
              onClick={() => void join({ action: 'new', name: newName.trim() })}
            >
              Unirme al grupo
            </Button>
          </div>

          {error && <p className="text-center text-xs text-debt">• {error}</p>}
        </div>
      )}
    </main>
  )
}
