import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconCheck,
  IconChevronRight,
  IconHistory,
  IconLogout,
  IconMailForward,
  IconPlus,
  IconReceipt,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { useAuth } from '@/hooks/useAuth'
import { useLoans, loanRemaining } from '@/hooks/useLoans'
import { useSplitGroups, memberIsMe, type NewSettlement } from '@/hooks/useSplitGroups'
import { useToast } from '@/hooks/useToast'
import { useUiStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ExpenseFormModal } from '@/components/split/ExpenseFormModal'
import { SettleModal } from '@/components/split/SettleModal'
import { activityLabel } from '@/lib/splitActivity'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import type { SplitExpense, SplitMember } from '@/types'

const AVATAR_COLORS = [
  'bg-primary/15 text-primary-deep',
  'bg-asset/15 text-asset-deep',
  'bg-[#F59E0B]/15 text-[#B45309]',
  'bg-[#EC4899]/15 text-[#BE185D]',
  'bg-[#06B6D4]/15 text-[#0E7490]',
] as const

function nameColorClass(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length
  }
  return AVATAR_COLORS[Math.abs(hash)]
}

export function PrestamoGrupo() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const loans = useLoans()
  const {
    groups,
    profiles,
    loading,
    ready,
    multiUserReady,
    displayName,
    addExpense,
    deleteExpense,
    addSettlement,
    deleteGroup,
    invite,
    leaveGroup,
  } = useSplitGroups({ loans: loans.data, paymentsByLoan: loans.paymentsByLoan })

  const storeExpenseOpen = useUiStore((s) => s.expenseModalOpen)
  const closeExpenseModal = useUiStore((s) => s.closeExpenseModal)

  const [expenseFormOpen, setExpenseFormOpen] = useState(false)
  const [settleEdge, setSettleEdge] = useState<{ from: SplitMember; to: SplitMember; amount: number } | null>(null)
  const [invitingMember, setInvitingMember] = useState<SplitMember | null>(null)
  const [deletingExpense, setDeletingExpense] = useState<SplitExpense | null>(null)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [leavingGroup, setLeavingGroup] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)

  const g = useMemo(() => groups.find((x) => x.group.id === groupId), [groups, groupId])

  useEffect(() => {
    if (storeExpenseOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpenseFormOpen(true)
      closeExpenseModal()
    }
  }, [storeExpenseOpen, closeExpenseModal])

  const membersById = useMemo(() => {
    const map = new Map<string, SplitMember>()
    for (const m of g?.members ?? []) map.set(m.id, m)
    return map
  }, [g])

  const totalGastado = useMemo(
    () => (g?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0),
    [g],
  )
  const me = g?.members.find((m) => memberIsMe(m, user?.id))
  const myNet = me ? (g?.nets.get(me.id) ?? 0) : 0

  const pendingInviteByMember = useMemo(() => {
    const map = new Map<string, string>()
    for (const inv of g?.invites ?? []) {
      if (inv.status === 'pending' && inv.invited_member_id) {
        map.set(inv.invited_member_id, inv.email)
      }
    }
    return map
  }, [g])

  /** Members for the expense form, with linked profile names resolved. */
  const formMembers = useMemo(
    () => (g?.activeMembers ?? []).map((m) => ({ ...m, name: displayName(m) })),
    [g, displayName],
  )

  if (loading || loans.loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 animate-[fade-in_300ms_ease-out]">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (!ready || !g) {
    return (
      <div className="p-4">
        <EmptyState
          icon={IconUsers}
          title="Grupo no encontrado"
          description="El grupo no existe o fue eliminado."
          action={
            <Button compact onClick={() => void navigate('/cuentas/prestamos')}>
              <IconArrowLeft size={14} /> Volver a préstamos
            </Button>
          }
        />
      </div>
    )
  }

  const hasActivity = g.expenses.length > 0 || g.settlements.length > 0 || g.legacyLoans.length > 0
  const visibleActivity = showAllActivity ? g.activity : g.activity.slice(0, 8)
  const canLeave = multiUserReady && !g.isOwner && Math.abs(myNet) < 0.005

  function creatorName(userId: string): string | null {
    if (userId === user?.id) return null // don't label your own expenses
    return profiles.get(userId)?.display_name ?? null
  }

  async function handleSettle(s: NewSettlement) {
    if (!groupId) return
    await addSettlement(groupId, s)
    toast.success('Liquidación registrada', 'Los balances del grupo fueron actualizados')
  }

  async function handleDeleteExpense() {
    if (!deletingExpense) return
    try {
      await deleteExpense(deletingExpense.id)
      toast.success('Gasto eliminado', 'El gasto fue eliminado del grupo')
    } catch {
      toast.error('Error', 'No se pudo eliminar el gasto')
    }
    setDeletingExpense(null)
  }

  async function handleDeleteGroup() {
    if (!groupId) return
    try {
      await deleteGroup(groupId)
      toast.success('Grupo eliminado', 'Los préstamos 1:1 asociados se conservan')
      void navigate('/cuentas/prestamos')
    } catch {
      toast.error('Error', 'No se pudo eliminar el grupo')
    }
  }

  async function handleLeaveGroup() {
    if (!groupId) return
    try {
      await leaveGroup(groupId)
      toast.success('Saliste del grupo', 'Ya no verás su actividad')
      void navigate('/cuentas/prestamos')
    } catch {
      toast.error('Error', 'No se pudo salir del grupo')
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-24 animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-2">
        <button
          type="button"
          onClick={() => void navigate('/cuentas/prestamos')}
          aria-label="Volver"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary"
        >
          <IconArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-text">{g.group.name}</p>
          <p className="text-[11px] text-text-tertiary">
            {g.activeMembers.length} personas · {g.expenses.length} gasto{g.expenses.length === 1 ? '' : 's'}
            {g.isConnected && ' · conectado'}
          </p>
        </div>
        {canLeave && (
          <button
            type="button"
            onClick={() => setLeavingGroup(true)}
            aria-label="Salir del grupo"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
          >
            <IconLogout size={16} />
          </button>
        )}
        {g.isOwner && (
          <button
            type="button"
            onClick={() => setDeletingGroup(true)}
            aria-label="Eliminar grupo"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
          >
            <IconTrash size={16} />
          </button>
        )}
      </div>

      {/* Summary banner */}
      <div className="px-4">
        <div className="flex items-stretch gap-2 rounded-xl bg-primary-soft/25 px-3.5 py-3">
          <div className="flex-1">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-primary-deep/70">
              Total gastado
            </p>
            <p className="mt-0.5 font-mono text-[15px] font-extrabold text-primary-deep">
              {formatMXN(totalGastado)}
            </p>
          </div>
          <div className="w-px bg-primary/15" />
          <div className="flex-1 pl-3">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-primary-deep/70">
              Tu balance
            </p>
            <p
              className={clsx(
                'mt-0.5 font-mono text-[15px] font-extrabold',
                myNet > 0 ? 'text-asset-deep' : myNet < 0 ? 'text-debt-deep' : 'text-primary-deep',
              )}
            >
              {myNet > 0 ? '+' : ''}{formatMXN(myNet)}
            </p>
          </div>
        </div>
      </div>

      {/* Member balances */}
      <div className="flex flex-col gap-2 px-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          Balances
        </p>
        <Card className="px-4 py-1">
          <ul className="divide-y divide-border">
            {g.activeMembers.map((m) => {
              const net = g.nets.get(m.id) ?? 0
              const isMe = memberIsMe(m, user?.id)
              const linked = m.member_user_id != null
              const profile = linked ? profiles.get(m.member_user_id!) : undefined
              const pendingEmail = pendingInviteByMember.get(m.id)
              const name = displayName(m)
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={name}
                      className="h-8 w-8 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold',
                        nameColorClass(name),
                      )}
                    >
                      {(name[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {name}
                      {isMe && <span className="ml-1 text-[10px] font-bold text-text-tertiary">(tú)</span>}
                    </p>
                    {multiUserReady && !isMe && (
                      linked ? (
                        <p className="text-[10px] font-bold text-asset-deep">Conectado</p>
                      ) : pendingEmail ? (
                        <p className="truncate text-[10px] font-semibold text-text-tertiary">
                          Invitación enviada · {pendingEmail}
                        </p>
                      ) : null
                    )}
                  </div>
                  {multiUserReady && !isMe && !linked && !pendingEmail && (
                    <button
                      type="button"
                      onClick={() => setInvitingMember(m)}
                      aria-label={`Invitar a ${name}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-primary-soft hover:text-primary-deep"
                    >
                      <IconMailForward size={15} />
                    </button>
                  )}
                  <span
                    className={clsx(
                      'font-mono text-[13px] font-bold tabular-nums',
                      net > 0 ? 'text-asset-deep' : net < 0 ? 'text-debt-deep' : 'text-text-tertiary',
                    )}
                  >
                    {net > 0 ? `+${formatMXN(net)}` : net < 0 ? formatMXN(net) : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      {/* Suggested transfers (debt simplification) */}
      {g.suggestions.length > 0 && (
        <div className="flex flex-col gap-2 px-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Para saldar el grupo
          </p>
          <Card className="px-4 py-1">
            <ul className="divide-y divide-border">
              {g.suggestions.map((s, i) => {
                const from = membersById.get(s.fromMemberId)
                const to = membersById.get(s.toMemberId)
                if (!from || !to) return null
                return (
                  <li key={i} className="flex items-center gap-2.5 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lavender-soft text-lavender-deep">
                      <IconArrowsExchange size={16} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">
                        {displayName(from)} <IconChevronRight size={11} className="inline text-text-tertiary" /> {displayName(to)}
                      </p>
                      <p className="font-mono text-[12px] font-bold text-primary-deep">
                        {formatMXN(s.amount)}
                      </p>
                    </div>
                    <Button
                      compact
                      variant="secondary"
                      onClick={() => setSettleEdge({ from, to, amount: s.amount })}
                    >
                      <IconCheck size={13} /> Liquidar
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      )}

      {/* Expenses */}
      <div className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Movimientos del grupo
          </p>
          <button
            type="button"
            onClick={() => setExpenseFormOpen(true)}
            className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
          >
            + Gasto
          </button>
        </div>

        {!hasActivity ? (
          <EmptyState
            icon={IconReceipt}
            title="Sin gastos aún"
            description="Registra el primer gasto compartido del grupo."
            action={
              <Button compact onClick={() => setExpenseFormOpen(true)}>
                <IconPlus size={14} /> Agregar gasto
              </Button>
            }
          />
        ) : (
          <Card className="px-4 py-1">
            <ul className="divide-y divide-border">
              {g.expenses.map((e) => {
                const payer = membersById.get(e.paid_by_member_id)
                const creator = creatorName(e.user_id)
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-deep">
                      <IconReceipt size={15} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">{e.description}</p>
                      <p className="truncate text-[11px] text-text-tertiary">
                        Pagó {payer ? displayName(payer) : '—'} · {formatDateGroupMX(e.expense_date)}
                        {creator && ` · Añadió ${creator}`}
                      </p>
                    </div>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-text">
                      {formatMXN(Number(e.amount))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeletingExpense(e)}
                      aria-label="Eliminar gasto"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                )
              })}
              {g.settlements.map((s) => {
                const from = membersById.get(s.from_member_id)
                const to = membersById.get(s.to_member_id)
                return (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-asset/10 text-asset-deep">
                      <IconCheck size={15} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">
                        {from ? displayName(from) : '—'} pagó a {to ? displayName(to) : '—'}
                      </p>
                      <p className="text-[11px] text-text-tertiary">
                        Liquidación · {formatDateGroupMX(s.created_at)}
                      </p>
                    </div>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-asset-deep">
                      {formatMXN(Number(s.amount))}
                    </span>
                  </li>
                )
              })}
              {g.legacyLoans.filter((l) => !l.paid_at).map((l) => {
                const remaining = loanRemaining(l, loans.paymentsByLoan[l.id] ?? [])
                return (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lavender-soft text-lavender-deep">
                      <IconUsers size={15} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">
                        Préstamo · {l.name}
                      </p>
                      <p className="text-[11px] text-text-tertiary">
                        {l.direction === 'owed_to_me' ? 'Te debe' : 'Le debes'} · {formatDateGroupMX(l.created_at)}
                      </p>
                    </div>
                    <Badge variant={l.direction === 'owed_to_me' ? 'info' : 'danger'}>
                      {formatMXN(remaining)}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* Activity history (multi-user audit feed) */}
      {multiUserReady && g.activity.length > 0 && (
        <div className="flex flex-col gap-2 px-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Historial
          </p>
          <Card className="px-4 py-1">
            <ul className="divide-y divide-border">
              {visibleActivity.map((a) => {
                const expenseId = (a.meta as { expense_id?: string }).expense_id
                const myShare =
                  me && expenseId
                    ? Number(
                        g.sharesByExpense
                          .get(expenseId)
                          ?.find((sh) => sh.member_id === me.id)?.amount ?? 0,
                      )
                    : null
                const line = activityLabel(a, me?.id ?? null, myShare)
                return (
                  <li key={a.id} className="flex items-start gap-2.5 py-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-text-tertiary">
                      <IconHistory size={13} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={clsx(
                          'text-[12.5px] font-medium leading-snug text-text',
                          line.struck && 'line-through opacity-60',
                        )}
                      >
                        {line.text}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-text-tertiary">
                        {line.impact && (
                          <span className={clsx('mr-1.5 font-bold', line.struck ? 'text-text-tertiary line-through' : 'text-debt-deep')}>
                            {line.impact}
                          </span>
                        )}
                        {formatDistanceToNow(parseISO(a.created_at), { locale: es, addSuffix: true })}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            {g.activity.length > 8 && !showAllActivity && (
              <button
                type="button"
                onClick={() => setShowAllActivity(true)}
                className="w-full py-2.5 text-center text-[12px] font-bold text-primary transition-colors hover:text-primary-deep"
              >
                Ver todo el historial ({g.activity.length})
              </button>
            )}
          </Card>
        </div>
      )}

      {/* ── Modals ── */}
      <ExpenseFormModal
        open={expenseFormOpen}
        onClose={() => setExpenseFormOpen(false)}
        members={formMembers}
        onSubmit={async (exp) => {
          if (!groupId) return
          await addExpense(groupId, exp)
          toast.success('Gasto registrado', `${exp.description} · ${formatMXN(exp.amount)}`)
        }}
      />

      {settleEdge && (
        <SettleModal
          open
          from={settleEdge.from}
          to={settleEdge.to}
          suggestedAmount={settleEdge.amount}
          onClose={() => setSettleEdge(null)}
          onSubmit={handleSettle}
        />
      )}

      {invitingMember && (
        <InviteMemberModal
          open
          member={invitingMember}
          onClose={() => setInvitingMember(null)}
          onInvite={async (email) => {
            if (!groupId) return
            await invite(groupId, email, invitingMember.id)
            toast.success('Invitación enviada', `Se envió un correo a ${email}`)
          }}
        />
      )}

      <ConfirmModal
        open={!!deletingExpense}
        title="Eliminar gasto"
        message={`¿Eliminar "${deletingExpense?.description ?? ''}"? Si lo registraste en una cuenta, el movimiento en la cuenta no se revierte automáticamente.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteExpense()}
        onClose={() => setDeletingExpense(null)}
      />

      <ConfirmModal
        open={deletingGroup}
        title="Eliminar grupo"
        message="Se eliminarán los gastos y liquidaciones del grupo para todos los miembros. Los préstamos 1:1 asociados se conservan. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteGroup()}
        onClose={() => setDeletingGroup(false)}
      />

      <ConfirmModal
        open={leavingGroup}
        title="Salir del grupo"
        message="Dejarás de ver la actividad del grupo. Tu historial de gastos se conserva para los demás miembros."
        confirmLabel="Salir"
        onConfirm={() => void handleLeaveGroup()}
        onClose={() => setLeavingGroup(false)}
      />
    </div>
  )
}

/* ── InviteMemberModal — small inline modal, not a screen ── */

function InviteMemberModal({
  open,
  member,
  onClose,
  onInvite,
}: {
  open: boolean
  member: SplitMember
  onClose: () => void
  onInvite: (email: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail('')
      setFormError('')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleaned)) {
      setFormError('Escribe un correo válido')
      return
    }
    setSubmitting(true)
    try {
      await onInvite(cleaned)
      onClose()
    } catch {
      setFormError('No se pudo enviar la invitación')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Invitar a ${member.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-[13px] leading-snug text-text-secondary">
          Recibirá un correo para unirse al grupo con su propia cuenta de Fortnight.
          Sus balances y gastos se mantienen — solo se conecta a esta persona.
        </p>
        <Input
          label="Correo"
          type="email"
          placeholder="nombre@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        {formError && <p className="text-xs text-debt">• {formError}</p>}
        <Button type="submit" loading={submitting} className="mt-1">
          Enviar invitación
        </Button>
      </form>
    </Modal>
  )
}
