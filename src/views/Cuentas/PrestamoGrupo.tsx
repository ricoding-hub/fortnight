import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconCheck,
  IconChevronRight,
  IconPlus,
  IconReceipt,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { useLoans, loanRemaining } from '@/hooks/useLoans'
import { useSplitGroups, type NewSettlement } from '@/hooks/useSplitGroups'
import { useToast } from '@/hooks/useToast'
import { useUiStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ExpenseFormModal } from '@/components/split/ExpenseFormModal'
import { SettleModal } from '@/components/split/SettleModal'
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
  const loans = useLoans()
  const {
    groups,
    loading,
    ready,
    addExpense,
    deleteExpense,
    addSettlement,
    deleteGroup,
  } = useSplitGroups({ loans: loans.data, paymentsByLoan: loans.paymentsByLoan })

  const storeExpenseOpen = useUiStore((s) => s.expenseModalOpen)
  const closeExpenseModal = useUiStore((s) => s.closeExpenseModal)

  const [expenseFormOpen, setExpenseFormOpen] = useState(false)
  const [settleEdge, setSettleEdge] = useState<{ from: SplitMember; to: SplitMember; amount: number } | null>(null)
  const [deletingExpense, setDeletingExpense] = useState<SplitExpense | null>(null)
  const [deletingGroup, setDeletingGroup] = useState(false)

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
  const me = g?.members.find((m) => m.is_me)
  const myNet = me ? (g?.nets.get(me.id) ?? 0) : 0

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
            {g.members.length} personas · {g.expenses.length} gasto{g.expenses.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDeletingGroup(true)}
          aria-label="Eliminar grupo"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
        >
          <IconTrash size={16} />
        </button>
      </div>

      {/* Summary banner — two-column pattern from MisCuentas MSI */}
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
            {g.members.map((m) => {
              const net = g.nets.get(m.id) ?? 0
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div
                    className={clsx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold',
                      nameColorClass(m.name),
                    )}
                  >
                    {(m.name[0] ?? '?').toUpperCase()}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                    {m.name}
                    {m.is_me && <span className="ml-1 text-[10px] font-bold text-text-tertiary">(tú)</span>}
                  </span>
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
                        {from.name} <IconChevronRight size={11} className="inline text-text-tertiary" /> {to.name}
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

      {/* Activity */}
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
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-deep">
                      <IconReceipt size={15} stroke={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">{e.description}</p>
                      <p className="text-[11px] text-text-tertiary">
                        Pagó {payer?.name ?? '—'} · {formatDateGroupMX(e.expense_date)}
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
                        {from?.name ?? '—'} pagó a {to?.name ?? '—'}
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

      {/* ── Modals ── */}
      <ExpenseFormModal
        open={expenseFormOpen}
        onClose={() => setExpenseFormOpen(false)}
        members={g.members}
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
        message="Se eliminarán los gastos y liquidaciones del grupo. Los préstamos 1:1 asociados se conservan. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteGroup()}
        onClose={() => setDeletingGroup(false)}
      />
    </div>
  )
}
