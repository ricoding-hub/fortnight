import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { supabase } from '@/lib/supabase'
import { useLoans, loanRemaining, type NewLoan } from '@/hooks/useLoans'
import { useSplitGroups, memberIsMe } from '@/hooks/useSplitGroups'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useUiStore } from '@/store/uiStore'
import { GroupFormModal } from '@/components/split/GroupFormModal'
import { AbonoModal, MarkPaidModal } from '@/components/split/LoanActionModals'
import { ExpenseFormModal } from '@/components/split/ExpenseFormModal'
import { SettleAllModal, type SettleAllBreakdownLine } from '@/components/split/SettleAllModal'
import { LoanFlowChart } from '@/components/LoanFlowChart'
import { buildLoanFlow } from '@/lib/loanFlow'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { StatCard } from '@/components/StatCard'
import { nameColorClass } from '@/lib/avatarColors'
import { errorMessage } from '@/lib/errorMessage'
import { SplitMovementRow, type SplitMovement } from '@/components/split/SplitMovementRow'
import { SortablePersonRow } from '@/components/split/SortablePersonRow'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useConfig } from '@/hooks/useConfig'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import type { Loan, LoanDirection, LoanPayment, SplitExpense, SplitExpenseShare, SplitSettlement } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Whole-peso display for KPIs and card nets — decimals looked broken there. */
function fmtCompact(n: number): string {
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${Math.round(abs).toLocaleString('es-MX')}`
}

/** Stable sort: items whose key is in `saved` come first (in saved order),
 *  the rest keep their incoming (recency) order. */
function sortBySaved<T>(items: T[], saved: string[], keyOf: (t: T) => string): T[] {
  const idx = new Map(saved.map((k, i) => [k, i]))
  return items
    .map((it, i) => ({ it, i, r: idx.get(keyOf(it)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.it)
}

function loanDateHint(loan: Loan, payments: LoanPayment[]): string {
  if (loan.paid_at) return `Saldado el ${formatDateGroupMX(loan.paid_at)}`
  const last = payments[payments.length - 1]
  if (last) return `Último abono ${formatDateGroupMX(last.created_at)}`
  return `Desde el ${formatDateGroupMX(loan.created_at)}`
}

function loanActivityKey(loan: Loan, payments: LoanPayment[]): string {
  const lastPay = payments.length > 0 ? payments[payments.length - 1].created_at : ''
  return loan.paid_at ?? (lastPay > loan.created_at ? lastPay : loan.created_at)
}

interface ContactGroup {
  name: string
  loans: Loan[]
  net: number
}


// ── LoanRow ───────────────────────────────────────────────────────────────────

function LoanRow({
  loan,
  payments,
  isPaidSection = false,
  onAbono,
  onMarkPaid,
  onEdit,
  onDelete,
  onUnmarkPaid,
}: {
  loan: Loan
  payments: LoanPayment[]
  isPaidSection?: boolean
  onAbono: () => void
  onMarkPaid: () => void
  onEdit: () => void
  onDelete: () => void
  onUnmarkPaid: () => void
}) {
  const remaining = loanRemaining(loan, payments)
  const hasPayments = payments.length > 0
  const paidPercent =
    Number(loan.amount) > 0
      ? Math.round((1 - remaining / Number(loan.amount)) * 100)
      : 0
  const dateHint = loanDateHint(loan, payments)
  const showRemaining = !isPaidSection && hasPayments && remaining < Number(loan.amount)

  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        {/* Direction icon */}
        <div
          className={clsx(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            loan.direction === 'owed_to_me'
              ? 'bg-primary/10 text-primary-deep'
              : 'bg-debt/10 text-debt-deep',
          )}
        >
          {loan.direction === 'owed_to_me' ? (
            <IconArrowDown size={12} stroke={2.5} />
          ) : (
            <IconArrowUp size={12} stroke={2.5} />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={loan.direction === 'owed_to_me' ? 'info' : 'danger'}>
              {loan.direction === 'owed_to_me' ? 'Te deben' : 'Debes'}
            </Badge>
            {isPaidSection && <Badge variant="success">Saldado</Badge>}
          </div>
          {loan.notes && (
            <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">
              {loan.notes}
            </p>
          )}

          {/* Amount — remaining first when applicable */}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
            {showRemaining ? (
              <>
                <span className="text-sm font-bold tabular-nums text-text">
                  {formatMXN(remaining)}
                </span>
                <span className="text-[11px] text-text-tertiary">restante</span>
                <span className="text-[11px] text-text-tertiary">
                  · de {formatMXN(Number(loan.amount))}
                </span>
              </>
            ) : (
              <span
                className={clsx(
                  'text-sm font-bold tabular-nums',
                  isPaidSection ? 'text-text-tertiary line-through' : 'text-text',
                )}
              >
                {formatMXN(Number(loan.amount))}
              </span>
            )}
          </div>

          {/* Date hint */}
          <p className="mt-0.5 text-[10px] text-text-tertiary">{dateHint}</p>

          {!isPaidSection && hasPayments && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Always-visible action row */}
      <div className="mt-2 flex items-center gap-1.5 pl-9">
        {!isPaidSection && (
          <>
            <button
              type="button"
              onClick={onAbono}
              className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-primary-deep transition-colors hover:bg-primary/20"
            >
              + Abono
            </button>
            <button
              type="button"
              onClick={onMarkPaid}
              className="flex items-center gap-1 rounded-lg bg-asset/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-asset-deep transition-colors hover:bg-asset/20"
            >
              <IconCheck size={12} /> Saldado
            </button>
          </>
        )}
        {isPaidSection && (
          <button
            type="button"
            onClick={onUnmarkPaid}
            className="rounded-lg bg-bg-secondary px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-border"
          >
            ↩ Recuperar
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Editar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
          >
            <IconEdit size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Eliminar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ContactGroupCard ──────────────────────────────────────────────────────────

function ContactGroupCard({
  group,
  paymentsByLoan,
  isPaidSection = false,
  onAbono,
  onMarkPaid,
  onEdit,
  onDelete,
  onUnmarkPaid,
  onOpenGroup,
  onSettleAll,
  connected = false,
  avatarUrl,
  splitMovements = [],
  onEditExpense,
  onDeleteExpense,
  onDeleteSettlement,
}: {
  group: ContactGroup
  paymentsByLoan: Record<string, LoanPayment[]>
  isPaidSection?: boolean
  onAbono: (loan: Loan) => void
  onMarkPaid: (loan: Loan) => void
  onEdit: (loan: Loan) => void
  onDelete: (loan: Loan) => void
  onUnmarkPaid: (loanId: string) => void
  /** Opens (creating on demand) the contact's direct group detail. */
  onOpenGroup?: () => void
  /** One-tap settlement of the full combined net with this person. */
  onSettleAll?: () => void
  /** The contact has a linked Fortnight account (real 1:1 sync). */
  connected?: boolean
  /** Linked contact's profile photo. */
  avatarUrl?: string
  /** Shared expenses/settlements of the direct group, editable inline. */
  splitMovements?: SplitMovement[]
  onEditExpense?: (expense: SplitExpense) => void
  onDeleteExpense?: (expense: SplitExpense) => void
  onDeleteSettlement?: (settlement: SplitSettlement) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const avatarColor = nameColorClass(group.name)

  return (
    <Card className="overflow-hidden px-4 py-2">
      <div className="flex w-full items-center gap-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={group.name}
              className="h-9 w-9 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div
              className={clsx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                avatarColor,
              )}
            >
              {(group.name[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
              <span className="truncate">{group.name}</span>
              {connected && (
                <span className="shrink-0 rounded-full bg-asset-soft px-1.5 py-0.5 text-[9px] font-extrabold text-asset-deep">
                  Conectado
                </span>
              )}
            </p>
            {!isPaidSection && (
              <p
                className={clsx(
                  'text-[11px] font-medium',
                  group.net > 0
                    ? 'text-primary-deep'
                    : group.net < 0
                      ? 'text-debt-deep'
                      : 'text-text-tertiary',
                )}
              >
                {group.net > 0
                  ? `Te deben ${fmtCompact(group.net)}`
                  : group.net < 0
                    ? `Debes ${fmtCompact(Math.abs(group.net))}`
                    : 'Sin saldo pendiente'}
                {group.loans.length > 1 && ` · ${group.loans.length} préstamos`}
              </p>
            )}
          </div>
          {expanded ? (
            <IconChevronDown size={16} className="shrink-0 text-text-tertiary" />
          ) : (
            <IconChevronRight size={16} className="shrink-0 text-text-tertiary" />
          )}
        </button>
        {onOpenGroup && (
          <button
            type="button"
            onClick={onOpenGroup}
            aria-label={`Ver conexión con ${group.name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-primary-soft hover:text-primary-deep"
          >
            <IconUsers size={16} />
          </button>
        )}
      </div>

      {expanded && (
        <ul className="divide-y divide-border">
          {group.loans.map((loan) => (
            <li key={loan.id}>
              <LoanRow
                loan={loan}
                payments={paymentsByLoan[loan.id] ?? []}
                isPaidSection={isPaidSection}
                onAbono={() => onAbono(loan)}
                onMarkPaid={() => onMarkPaid(loan)}
                onEdit={() => onEdit(loan)}
                onDelete={() => onDelete(loan)}
                onUnmarkPaid={() => onUnmarkPaid(loan.id)}
              />
            </li>
          ))}
          {!isPaidSection &&
            splitMovements.map((mv) => (
              <li key={`${mv.kind}:${mv.id}`}>
                <SplitMovementRow
                  mv={mv}
                  onEditExpense={onEditExpense}
                  onDeleteExpense={onDeleteExpense}
                  onDeleteSettlement={onDeleteSettlement}
                />
              </li>
            ))}
        </ul>
      )}

      {!isPaidSection && onSettleAll && group.net !== 0 && (
        <button
          type="button"
          onClick={onSettleAll}
          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-asset/10 py-2 text-[12px] font-bold text-asset-deep transition-colors hover:bg-asset/20"
        >
          <IconCheck size={13} stroke={2.5} /> Saldar todo ({fmtCompact(Math.abs(group.net))})
        </button>
      )}
    </Card>
  )
}

// ── GroupCard (multi-person, expandable) ───────────────────────────────────────

interface GroupMemberBalance {
  id: string
  name: string
  avatarUrl?: string
  net: number
}

function GroupCard({
  name,
  imageUrl,
  net,
  memberCount,
  balances,
  movements,
  onOpen,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onDeleteSettlement,
}: {
  name: string
  imageUrl?: string | null
  net: number
  memberCount: number
  balances: GroupMemberBalance[]
  movements: SplitMovement[]
  onOpen: () => void
  onAddExpense: () => void
  onEditExpense?: (expense: SplitExpense) => void
  onDeleteExpense?: (expense: SplitExpense) => void
  onDeleteSettlement?: (settlement: SplitSettlement) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card className="overflow-hidden px-4 py-2">
      <div className="flex w-full items-center gap-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender-soft text-lavender-deep">
              <IconUsers size={17} stroke={2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">{name}</p>
            <p
              className={clsx(
                'text-[11px] font-medium',
                net > 0 ? 'text-primary-deep' : net < 0 ? 'text-debt-deep' : 'text-text-tertiary',
              )}
            >
              {net > 0
                ? `Te deben ${fmtCompact(net)}`
                : net < 0
                  ? `Debes ${fmtCompact(Math.abs(net))}`
                  : 'Grupo saldado'}
              {` · ${memberCount} personas`}
            </p>
          </div>
          {expanded ? (
            <IconChevronDown size={16} className="shrink-0 text-text-tertiary" />
          ) : (
            <IconChevronRight size={16} className="shrink-0 text-text-tertiary" />
          )}
        </button>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Abrir ${name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-primary-soft hover:text-primary-deep"
        >
          <IconArrowRight size={16} />
        </button>
      </div>

      {expanded && (
        <div className="pb-1">
          {/* Member balances */}
          <ul className="divide-y divide-border border-t border-border">
            {balances.map((b) => (
              <li key={b.id} className="flex items-center gap-2.5 py-2">
                {b.avatarUrl ? (
                  <img src={b.avatarUrl} alt={b.name} className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
                      nameColorClass(b.name),
                    )}
                  >
                    {(b.name[0] ?? '?').toUpperCase()}
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">
                  {b.name}
                </span>
                <span
                  className={clsx(
                    'font-mono text-[12px] font-bold tabular-nums',
                    b.net > 0 ? 'text-asset-deep' : b.net < 0 ? 'text-debt-deep' : 'text-text-tertiary',
                  )}
                >
                  {b.net > 0 ? `+${fmtCompact(b.net)}` : b.net < 0 ? fmtCompact(b.net) : '—'}
                </span>
              </li>
            ))}
          </ul>

          {/* Recent movements */}
          {movements.length > 0 && (
            <ul className="divide-y divide-border border-t border-border">
              {movements.map((mv) => (
                <li key={`${mv.kind}:${mv.id}`}>
                  <SplitMovementRow
                    mv={mv}
                    onEditExpense={onEditExpense}
                    onDeleteExpense={onDeleteExpense}
                    onDeleteSettlement={onDeleteSettlement}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 flex items-center gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={onAddExpense}
              className="flex-1 rounded-lg bg-primary/10 py-2 text-[12px] font-bold text-primary-deep transition-colors hover:bg-primary/20"
            >
              + Gasto
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="flex-1 rounded-lg bg-bg-secondary py-2 text-[12px] font-bold text-text-secondary transition-colors hover:bg-border"
            >
              Ver grupo
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MisPrestamos() {
  const {
    data: allLoans,
    active,
    paid,
    paymentsByLoan,
    porCobrar,
    porPagar,
    loading,
    error,
    create,
    update,
    markPaid,
    unmarkPaid,
    deleteLoan,
    addPayment,
    refetch: refetchLoans,
  } = useLoans()
  const {
    groups: splitGroups,
    profiles,
    recentContacts,
    splitCobrar,
    splitPagar,
    ready: splitReady,
    displayName,
    createGroup,
    ensureDirectGroup,
    settleAllWithContact,
    addExpense,
    updateExpense,
    deleteExpense,
    deleteSettlement,
  } = useSplitGroups({ loans: allLoans, paymentsByLoan })
  const { user } = useAuth()
  const { data: config, update: updateConfig } = useConfig()
  const navigate = useNavigate()
  const toast = useToast()
  const storeLoanOpen = useUiStore((s) => s.loanModalOpen)
  const closeLoanModal = useUiStore((s) => s.closeLoanModal)

  const [reorderMode, setReorderMode] = useState(false)
  const sensors = useSensors(
    // A short press-delay lets normal taps/scroll through; hold to drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
  )

  const [loanFormOpen, setLoanFormOpen] = useState(false)
  const [groupFormOpen, setGroupFormOpen] = useState(false)
  const [settleAllContact, setSettleAllContact] = useState<{
    name: string
    net: number
    breakdown: SettleAllBreakdownLine[]
  } | null>(null)
  const [inlineExpense, setInlineExpense] = useState<SplitExpense | null>(null)
  const [addExpenseGroupId, setAddExpenseGroupId] = useState<string | null>(null)
  const [deletingSplitExpense, setDeletingSplitExpense] = useState<SplitExpense | null>(null)
  const [deletingSplitSettlement, setDeletingSplitSettlement] = useState<SplitSettlement | null>(null)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [formDefaultDir, setFormDefaultDir] = useState<LoanDirection>('owed_to_me')
  const [abonoLoan, setAbonoLoan] = useState<Loan | null>(null)
  const [markPaidLoan, setMarkPaidLoan] = useState<Loan | null>(null)
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null)
  const [showPaid, setShowPaid] = useState(false)

  function openCreate(dir: LoanDirection = 'owed_to_me') {
    setEditingLoan(null)
    setFormDefaultDir(dir)
    setLoanFormOpen(true)
  }

  function openEdit(loan: Loan) {
    setEditingLoan(loan)
    setFormDefaultDir(loan.direction)
    setLoanFormOpen(true)
  }

  useEffect(() => {
    if (storeLoanOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openCreate('owed_to_me')
      closeLoanModal()
    }
  }, [storeLoanOpen, closeLoanModal])

  async function handleUnmarkPaid(loanId: string) {
    try {
      await unmarkPaid(loanId)
      toast.success('Préstamo reabierto', 'El préstamo volvió a estar activo')
    } catch {
      toast.error('Error', 'No se pudo desmarcar el préstamo')
    }
  }

  async function handleDelete() {
    if (!deletingLoan) return
    const loan = deletingLoan
    try {
      await deleteLoan(loan.id)
      toast.success('Préstamo eliminado', `Se eliminó el préstamo de ${loan.name}`)
    } catch {
      toast.error('Error', 'No se pudo eliminar el préstamo')
    }
  }

  const activeGroups = useMemo<ContactGroup[]>(() => {
    const map = new Map<string, Loan[]>()
    for (const l of active) {
      const key = l.name.trim().toLowerCase()
      map.set(key, [...(map.get(key) ?? []), l])
    }
    return Array.from(map.values())
      .map((loans) => {
        const sorted = [...loans].sort((a, b) =>
          loanActivityKey(b, paymentsByLoan[b.id] ?? []).localeCompare(
            loanActivityKey(a, paymentsByLoan[a.id] ?? []),
          ),
        )
        return {
          name: sorted[0].name,
          loans: sorted,
          net: sorted.reduce((s, l) => {
            const rem = loanRemaining(l, paymentsByLoan[l.id] ?? [])
            return l.direction === 'owed_to_me' ? s + rem : s - rem
          }, 0),
        }
      })
      .sort((a, b) => {
        const aKey = a.loans.reduce((mx, l) => {
          const k = loanActivityKey(l, paymentsByLoan[l.id] ?? [])
          return k > mx ? k : mx
        }, '')
        const bKey = b.loans.reduce((mx, l) => {
          const k = loanActivityKey(l, paymentsByLoan[l.id] ?? [])
          return k > mx ? k : mx
        }, '')
        return bKey.localeCompare(aKey)
      })
  }, [active, paymentsByLoan])

  const paidGroups = useMemo<ContactGroup[]>(() => {
    const map = new Map<string, Loan[]>()
    for (const l of paid) {
      const key = l.name.trim().toLowerCase()
      map.set(key, [...(map.get(key) ?? []), l])
    }
    return Array.from(map.values())
      .map((loans) => {
        const sorted = [...loans].sort((a, b) =>
          (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at),
        )
        return { name: sorted[0].name, loans: sorted, net: 0 }
      })
      .sort((a, b) => {
        const aKey = a.loans.reduce((mx, l) => ((l.paid_at ?? '') > mx ? (l.paid_at ?? '') : mx), '')
        const bKey = b.loans.reduce((mx, l) => ((l.paid_at ?? '') > mx ? (l.paid_at ?? '') : mx), '')
        return bKey.localeCompare(aKey)
      })
  }, [paid])

  const allNames = useMemo(() => {
    const names = new Set([...active, ...paid].map((l) => l.name.trim()))
    return Array.from(names).sort()
  }, [active, paid])

  // GRUPOS section = real multi-person groups ONLY (3+ active members).
  // A balance with one person is a 1:1 relationship, never "a group" —
  // 2-person groups (connected or not) live in the ACTIVOS contact cards.
  const sharedGroups = useMemo(
    () => splitGroups.filter((g) => g.activeMembers.length > 2),
    [splitGroups],
  )

  // Direct 2-person group per contact (connected or not), for combined
  // nets, "Ver grupo" navigation and "Saldar todo".
  const directGroupByContact = useMemo(() => {
    const map = new Map<string, (typeof splitGroups)[number]>()
    for (const g of splitGroups) {
      if (g.activeMembers.length !== 2) continue
      const contact = g.activeMembers.find((m) => !memberIsMe(m, user?.id))
      if (contact) map.set(contact.name.trim().toLowerCase(), g)
    }
    return map
  }, [splitGroups, user?.id])

  /** Combined net for a contact: open loans + split-only net of their group. */
  const contactNet = useMemo(() => {
    return (group: ContactGroup): number => {
      const direct = directGroupByContact.get(group.name.trim().toLowerCase())
      return group.net + (direct?.mySplitNet ?? 0)
    }
  }, [directGroupByContact])

  /** Linked contact's profile photo, when connected. */
  const contactAvatar = useMemo(() => {
    return (contactKey: string): string | undefined => {
      const direct = directGroupByContact.get(contactKey)
      const contact = direct?.activeMembers.find((m) => !memberIsMe(m, user?.id))
      if (!contact?.member_user_id) return undefined
      return profiles.get(contact.member_user_id)?.avatar_url ?? undefined
    }
  }, [directGroupByContact, profiles, user?.id])

  /** Shared movements of the contact's direct group, newest first. */
  const contactMovements = useMemo(() => {
    return (contactKey: string): SplitMovement[] => {
      const direct = directGroupByContact.get(contactKey)
      if (!direct || !user) return []
      const meMember = direct.activeMembers.find((m) => memberIsMe(m, user.id))
      if (!meMember) return []
      const out: SplitMovement[] = []
      for (const e of direct.expenses) {
        const shares = direct.sharesByExpense.get(e.id) ?? []
        const myShare = shares
          .filter((sh) => sh.member_id === meMember.id)
          .reduce((s, sh) => s + Number(sh.amount), 0)
        const iPaid = e.paid_by_member_id === meMember.id
        const payer = direct.members.find((m) => m.id === e.paid_by_member_id)
        out.push({
          kind: 'expense',
          id: e.id,
          description: e.description,
          payerName: payer ? displayName(payer) : '—',
          date: e.expense_date,
          myEffect: iPaid ? Number(e.amount) - myShare : -myShare,
          expense: e,
        })
      }
      for (const s of direct.settlements) {
        const received = s.to_member_id === meMember.id
        out.push({
          kind: 'settlement',
          id: s.id,
          description: received ? 'Recibiste un pago' : 'Pagaste',
          payerName: '',
          date: s.created_at,
          myEffect: received ? -Number(s.amount) : Number(s.amount),
          settlement: s,
        })
      }
      return out.sort((a, b) => b.date.localeCompare(a.date))
    }
  }, [directGroupByContact, user, displayName])

  /** Balances + recent movements for an expandable multi-person group card. */
  const groupCardData = useCallback(
    (g: (typeof splitGroups)[number]) => {
      const me = g.activeMembers.find((m) => memberIsMe(m, user?.id))
      const net = me ? (g.nets.get(me.id) ?? 0) : 0
      const balances: GroupMemberBalance[] = g.activeMembers.map((m) => ({
        id: m.id,
        name: displayName(m),
        avatarUrl: m.member_user_id ? (profiles.get(m.member_user_id)?.avatar_url ?? undefined) : undefined,
        net: g.nets.get(m.id) ?? 0,
      }))
      const movements: SplitMovement[] = []
      if (me) {
        for (const e of g.expenses) {
          const shares = g.sharesByExpense.get(e.id) ?? []
          const myShare = shares
            .filter((sh) => sh.member_id === me.id)
            .reduce((s, sh) => s + Number(sh.amount), 0)
          const iPaid = e.paid_by_member_id === me.id
          const payer = g.members.find((m) => m.id === e.paid_by_member_id)
          movements.push({
            kind: 'expense',
            id: e.id,
            description: e.description,
            payerName: payer ? displayName(payer) : '—',
            date: e.expense_date,
            myEffect: iPaid ? Number(e.amount) - myShare : -myShare,
            expense: e,
          })
        }
        for (const s of g.settlements) {
          const received = s.to_member_id === me.id
          movements.push({
            kind: 'settlement',
            id: s.id,
            description: received ? 'Recibiste un pago' : 'Pagaste',
            payerName: '',
            date: s.created_at,
            myEffect: received ? -Number(s.amount) : Number(s.amount),
            settlement: s,
          })
        }
        movements.sort((a, b) => b.date.localeCompare(a.date))
      }
      return { net, balances, movements: movements.slice(0, 4) }
    },
    [user?.id, displayName, profiles],
  )

  async function handleDeleteSplitExpense() {
    if (!deletingSplitExpense) return
    try {
      await deleteExpense(deletingSplitExpense.id)
      toast.success('Gasto eliminado', 'El gasto compartido fue eliminado')
    } catch {
      toast.error('Error', 'No se pudo eliminar el gasto')
    }
    setDeletingSplitExpense(null)
  }

  async function handleDeleteSplitSettlement() {
    if (!deletingSplitSettlement) return
    try {
      await deleteSettlement(deletingSplitSettlement.id)
      toast.success('Liquidación eliminada', 'Los balances fueron restaurados')
    } catch {
      toast.error('Error', 'No se pudo eliminar la liquidación')
    }
    setDeletingSplitSettlement(null)
  }

  // Group + members backing the inline expense editor.
  const inlineExpenseGroup = inlineExpense
    ? splitGroups.find((g) => g.group.id === inlineExpense.group_id)
    : undefined
  const addExpenseGroup = addExpenseGroupId
    ? splitGroups.find((g) => g.group.id === addExpenseGroupId)
    : undefined

  // Connected 1:1 relationships without open loans still deserve their
  // contact card (the relationship's single home) — synthesize entries
  // for connected 2-person groups not already covered by a loans card.
  const connectedExtras = useMemo(() => {
    const loanNames = new Set(activeGroups.map((g) => g.name.trim().toLowerCase()))
    const out: Array<{ name: string; localKey: string; groupId: string; net: number }> = []
    for (const g of splitGroups) {
      if (g.activeMembers.length !== 2 || !g.isConnected) continue
      const contact = g.activeMembers.find((m) => !memberIsMe(m, user?.id))
      if (!contact || loanNames.has(contact.name.trim().toLowerCase())) continue
      out.push({
        name: displayName(contact),
        // Lookup key for directGroupByContact (the member's LOCAL name,
        // which can differ from the linked profile's display name).
        localKey: contact.name.trim().toLowerCase(),
        groupId: g.group.id,
        net: g.mySplitNet,
      })
    }
    return out
  }, [splitGroups, activeGroups, user?.id, displayName])

  // Unified "people" list (contacts with loans + connected 1:1 without loans),
  // ordered by the saved manual order first, then recency.
  interface PersonItem {
    key: string
    kind: 'active' | 'connected'
    activeGroup?: ContactGroup
    connectedExtra?: (typeof connectedExtras)[number]
  }
  const peopleItems = useMemo<PersonItem[]>(() => {
    const items: PersonItem[] = []
    for (const g of activeGroups) {
      items.push({ key: g.name.trim().toLowerCase(), kind: 'active', activeGroup: g })
    }
    for (const extra of connectedExtras) {
      items.push({ key: extra.localKey, kind: 'connected', connectedExtra: extra })
    }
    return sortBySaved(items, config?.loan_order?.activos ?? [], (i) => i.key)
  }, [activeGroups, connectedExtras, config?.loan_order])

  const orderedGroups = useMemo(
    () => sortBySaved(sharedGroups, config?.loan_order?.grupos ?? [], (g) => g.group.id),
    [sharedGroups, config?.loan_order],
  )

  const totalOrderable = peopleItems.length + orderedGroups.length

  async function savePeopleOrder(keys: string[]) {
    await updateConfig({ loan_order: { ...(config?.loan_order ?? {}), activos: keys } })
  }
  async function saveGroupOrder(ids: string[]) {
    await updateConfig({ loan_order: { ...(config?.loan_order ?? {}), grupos: ids } })
  }
  function onPeopleDragEnd(e: DragEndEvent) {
    const { active: a, over } = e
    if (!over || a.id === over.id) return
    const keys = peopleItems.map((i) => i.key)
    void savePeopleOrder(arrayMove(keys, keys.indexOf(a.id as string), keys.indexOf(over.id as string)))
  }
  function onGroupsDragEnd(e: DragEndEvent) {
    const { active: a, over } = e
    if (!over || a.id === over.id) return
    const ids = orderedGroups.map((g) => g.group.id)
    void saveGroupOrder(arrayMove(ids, ids.indexOf(a.id as string), ids.indexOf(over.id as string)))
  }

  /* ── KPI derivations ── */
  const totalCobrar = porCobrar + splitCobrar
  const totalPagar = porPagar + splitPagar
  const netoTotal = totalCobrar - totalPagar

  const { peopleOwingMe, peopleIOwe } = useMemo(() => {
    let owing = 0
    let iOwe = 0
    for (const g of activeGroups) {
      const net = contactNet(g)
      if (net > 0.005) owing++
      else if (net < -0.005) iOwe++
    }
    for (const extra of connectedExtras) {
      if (extra.net > 0.005) owing++
      else if (extra.net < -0.005) iOwe++
    }
    for (const g of sharedGroups) {
      if (g.mySplitNet > 0.005) owing++
      else if (g.mySplitNet < -0.005) iOwe++
    }
    return { peopleOwingMe: owing, peopleIOwe: iOwe }
  }, [activeGroups, connectedExtras, sharedGroups, contactNet])

  // Recovered in the last 30 days: abonos on owed_to_me loans + settlements received.
  const recuperado30d = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffISO = cutoff.toISOString()
    let sum = 0
    for (const l of allLoans) {
      if (l.direction !== 'owed_to_me') continue
      for (const p of paymentsByLoan[l.id] ?? []) {
        if (p.created_at >= cutoffISO) sum += Number(p.amount)
      }
    }
    for (const g of splitGroups) {
      const me = g.members.find((m) => memberIsMe(m, user?.id))
      if (!me) continue
      for (const s of g.settlements) {
        if (s.to_member_id === me.id && s.created_at >= cutoffISO) sum += Number(s.amount)
      }
    }
    return sum
  }, [allLoans, paymentsByLoan, splitGroups, user?.id])

  // Monthly lending flow for the chart at the bottom.
  const loanFlow = useMemo(() => {
    const myMemberIds = new Set<string>()
    const expenses: SplitExpense[] = []
    const settlements: SplitSettlement[] = []
    const sharesByExpense = new Map<string, SplitExpenseShare[]>()
    for (const g of splitGroups) {
      const me = g.members.find((m) => memberIsMe(m, user?.id))
      if (me) myMemberIds.add(me.id)
      expenses.push(...g.expenses)
      settlements.push(...g.settlements)
      for (const e of g.expenses) {
        sharesByExpense.set(e.id, g.sharesByExpense.get(e.id) ?? [])
      }
    }
    return buildLoanFlow({
      loans: allLoans,
      paymentsByLoan,
      expenses,
      sharesByExpense,
      settlements,
      myMemberIds,
      now: new Date(),
      months: 6,
    })
  }, [splitGroups, allLoans, paymentsByLoan, user?.id])

  const hasFlowData = useMemo(
    () => loanFlow.some((p) => p.prestado !== 0 || p.recuperado !== 0 || p.pendiente !== 0),
    [loanFlow],
  )

  /** Open the contact's direct group (creating + stamping on demand). */
  async function handleOpenContactGroup(contactName: string) {
    try {
      const id = await ensureDirectGroup(contactName)
      void navigate(`/cuentas/prestamos/${id}`)
    } catch (e) {
      // Surface the real cause (Supabase errors aren't Error instances).
      console.error('ensureDirectGroup failed', e)
      toast.error('No se pudo abrir la conexión', errorMessage(e))
    }
  }

  /** Prepare the settle-all modal with a transparent breakdown. */
  function openSettleAll(group: ContactGroup) {
    const net = contactNet(group)
    if (Math.abs(net) < 0.005) return
    const breakdown: SettleAllBreakdownLine[] = group.loans
      .filter((l) => !l.paid_at)
      .map((l) => ({
        label: `Préstamo · ${l.direction === 'owed_to_me' ? 'te debe' : 'debes'}`,
        amount: loanRemaining(l, paymentsByLoan[l.id] ?? []),
      }))
      .filter((line) => line.amount > 0)
    const direct = directGroupByContact.get(group.name.trim().toLowerCase())
    if (direct && Math.abs(direct.mySplitNet) > 0.005) {
      breakdown.push({ label: 'Gastos compartidos (neto)', amount: Math.abs(direct.mySplitNet) })
    }
    setSettleAllContact({ name: group.name, net, breakdown })
  }

  async function handleSettleAll(opts: { accountId?: string | null; note?: string | null }) {
    if (!settleAllContact) return
    const groupId = await ensureDirectGroup(settleAllContact.name)
    await settleAllWithContact(groupId, opts)
    // Immediate refresh — loan payments live in useLoans, whose realtime
    // echo may lag; without this the settled balance lingered on screen.
    await refetchLoans()
    toast.success(
      'Todo saldado',
      `Cuentas en cero con ${settleAllContact.name} · ${formatMXN(Math.abs(settleAllContact.net))}`,
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 animate-[fade-in_300ms_ease-out]">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-xl shimmer" />
          ))}
        </div>
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-debt/20 bg-debt/5">
          <p className="text-sm font-medium text-debt">No se pudieron cargar los préstamos.</p>
        </Card>
      </div>
    )
  }

  const hasAny =
    active.length > 0 || paid.length > 0 || sharedGroups.length > 0 || connectedExtras.length > 0

  return (
    <div className="flex flex-col gap-3 pb-24 animate-[fade-in_300ms_ease-out]">
      {/* Net balance hero — loans + splits, always coherent. Hidden when
          there is nothing yet so the empty state stands alone. */}
      {hasAny && (
      <>
      <div className="px-4 pt-2">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-text-secondary">Balance de préstamos</p>
          <p
            className={clsx(
              'mt-0.5 text-[26px] font-bold leading-tight tabular-nums',
              netoTotal > 0 ? 'text-asset-deep' : netoTotal < 0 ? 'text-debt-deep' : 'text-text',
            )}
          >
            {netoTotal > 0 ? '+' : ''}{fmtCompact(netoTotal)}
          </p>
          {(totalCobrar > 0 || totalPagar > 0) && (
            <div className="mt-2.5 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
              <div
                className="rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(totalCobrar / (totalCobrar + totalPagar)) * 100}%` }}
              />
              <div
                className="rounded-full bg-debt transition-all duration-500"
                style={{ width: `${(totalPagar / (totalCobrar + totalPagar)) * 100}%` }}
              />
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            {peopleOwingMe > 0 && `Te deben ${peopleOwingMe} persona${peopleOwingMe === 1 ? '' : 's'}`}
            {peopleOwingMe > 0 && peopleIOwe > 0 && ' · '}
            {peopleIOwe > 0 && `Debes a ${peopleIOwe} persona${peopleIOwe === 1 ? '' : 's'}`}
            {peopleOwingMe === 0 && peopleIOwe === 0 && 'Sin saldos pendientes'}
          </p>
        </Card>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 px-4">
        <StatCard compact label="Por cobrar" value={fmtCompact(totalCobrar)} tone="primary" icon={IconArrowDown} />
        <StatCard compact label="Por pagar" value={fmtCompact(totalPagar)} tone="debt" icon={IconArrowUp} />
        <StatCard compact label="Recuperado 30d" value={fmtCompact(recuperado30d)} tone="asset" icon={IconCheck} />
      </div>
      </>
      )}

      {!hasAny ? (
        <div className="px-4">
          <EmptyState
            icon={IconUsers}
            title="Sin préstamos"
            description="Registra lo que te deben, lo que debes, o crea un grupo para dividir gastos."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button compact onClick={() => openCreate('owed_to_me')}>
                  <IconArrowDown size={14} /> Me deben
                </Button>
                <Button compact variant="secondary" onClick={() => openCreate('i_owe')}>
                  <IconArrowUp size={14} /> Yo debo
                </Button>
                {splitReady && (
                  <Button compact variant="secondary" onClick={() => setGroupFormOpen(true)}>
                    <IconUsers size={14} /> Grupo
                  </Button>
                )}
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* Reorder toggle — collapses cards to draggable rows */}
          {totalOrderable > 1 && (
            <div className="flex justify-end px-4">
              <button
                type="button"
                onClick={() => setReorderMode((v) => !v)}
                className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
              >
                {reorderMode ? 'Listo' : 'Reordenar'}
              </button>
            </div>
          )}

          {/* Shared expense groups */}
          {orderedGroups.length > 0 && (
            <div className="flex flex-col gap-2 px-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  Grupos
                </p>
                {!reorderMode && (
                  <button
                    type="button"
                    onClick={() => setGroupFormOpen(true)}
                    className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
                  >
                    + Grupo
                  </button>
                )}
              </div>
              {reorderMode ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onGroupsDragEnd}>
                  <SortableContext items={orderedGroups.map((g) => g.group.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {orderedGroups.map((g) => {
                        const data = groupCardData(g)
                        return (
                          <SortablePersonRow
                            key={g.group.id}
                            id={g.group.id}
                            name={g.group.name}
                            net={data.net}
                            netLabel={data.net === 0 ? 'Saldado' : (data.net > 0 ? '+' : '') + fmtCompact(data.net)}
                            avatarUrl={g.group.image_url ?? undefined}
                            group
                          />
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                orderedGroups.map((g) => {
                  const data = groupCardData(g)
                  return (
                    <GroupCard
                      key={g.group.id}
                      name={g.group.name}
                      imageUrl={g.group.image_url}
                      net={data.net}
                      memberCount={g.activeMembers.length}
                      balances={data.balances}
                      movements={data.movements}
                      onOpen={() => void navigate(`/cuentas/prestamos/${g.group.id}`)}
                      onAddExpense={() => setAddExpenseGroupId(g.group.id)}
                      onEditExpense={setInlineExpense}
                      onDeleteExpense={setDeletingSplitExpense}
                      onDeleteSettlement={setDeletingSplitSettlement}
                    />
                  )
                })
              )}
            </div>
          )}

          {/* Active contact people (loans + connected 1:1) */}
          {peopleItems.length > 0 && (
            <div className="flex flex-col gap-2 px-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  Activos
                </p>
                {!reorderMode && (
                  <div className="flex items-center gap-3">
                    {splitReady && (
                      <button
                        type="button"
                        onClick={() => setGroupFormOpen(true)}
                        className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
                      >
                        + Grupo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openCreate()}
                      className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
                    >
                      + Nuevo
                    </button>
                  </div>
                )}
              </div>
              {reorderMode ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPeopleDragEnd}>
                  <SortableContext items={peopleItems.map((i) => i.key)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {peopleItems.map((item) => {
                        const net = item.activeGroup
                          ? contactNet(item.activeGroup)
                          : (item.connectedExtra?.net ?? 0)
                        const name = item.activeGroup?.name ?? item.connectedExtra?.name ?? ''
                        return (
                          <SortablePersonRow
                            key={item.key}
                            id={item.key}
                            name={name}
                            net={net}
                            netLabel={net === 0 ? 'Saldado' : (net > 0 ? '+' : '') + fmtCompact(net)}
                            avatarUrl={contactAvatar(item.key)}
                          />
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                peopleItems.map((item) => {
                  if (item.activeGroup) {
                    const g = item.activeGroup
                    const key = item.key
                    const combined = { ...g, net: contactNet(g) }
                    const isConnected = directGroupByContact.get(key)?.isConnected ?? false
                    return (
                      <ContactGroupCard
                        key={`active:${key}`}
                        group={combined}
                        connected={isConnected}
                        avatarUrl={contactAvatar(key)}
                        splitMovements={contactMovements(key)}
                        paymentsByLoan={paymentsByLoan}
                        onAbono={(loan) => setAbonoLoan(loan)}
                        onMarkPaid={(loan) => setMarkPaidLoan(loan)}
                        onEdit={openEdit}
                        onDelete={(loan) => setDeletingLoan(loan)}
                        onUnmarkPaid={(id) => void handleUnmarkPaid(id)}
                        onOpenGroup={splitReady ? () => void handleOpenContactGroup(g.name) : undefined}
                        onSettleAll={splitReady ? () => openSettleAll(combined) : undefined}
                        onEditExpense={setInlineExpense}
                        onDeleteExpense={setDeletingSplitExpense}
                        onDeleteSettlement={setDeletingSplitSettlement}
                      />
                    )
                  }
                  const extra = item.connectedExtra!
                  const key = item.key
                  const pseudo: ContactGroup = { name: extra.name, loans: [], net: extra.net }
                  return (
                    <ContactGroupCard
                      key={`connected:${extra.groupId}`}
                      group={pseudo}
                      connected
                      avatarUrl={contactAvatar(key)}
                      splitMovements={contactMovements(key)}
                      paymentsByLoan={paymentsByLoan}
                      onAbono={() => {}}
                      onMarkPaid={() => {}}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onUnmarkPaid={() => {}}
                      onOpenGroup={() => void navigate(`/cuentas/prestamos/${extra.groupId}`)}
                      onSettleAll={
                        Math.abs(extra.net) > 0.005 ? () => openSettleAll(pseudo) : undefined
                      }
                      onEditExpense={setInlineExpense}
                      onDeleteExpense={setDeletingSplitExpense}
                      onDeleteSettlement={setDeletingSplitSettlement}
                    />
                  )
                })
              )}
            </div>
          )}

          {/* Paid section toggle */}
          {paidGroups.length > 0 && (
            <div className="px-4">
              <button
                type="button"
                onClick={() => setShowPaid((v) => !v)}
                className="mb-2 flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary-deep"
              >
                {showPaid ? (
                  <IconChevronDown size={14} />
                ) : (
                  <IconChevronRight size={14} />
                )}
                {showPaid ? 'Ocultar saldados' : `Ver saldados (${paid.length})`}
              </button>
              {showPaid && (
                <div className="flex flex-col gap-2 animate-[scale-in_200ms_ease-out]">
                  {paidGroups.map((g) => (
                    <ContactGroupCard
                      key={g.name.toLowerCase()}
                      group={g}
                      paymentsByLoan={paymentsByLoan}
                      isPaidSection
                      onAbono={(loan) => setAbonoLoan(loan)}
                      onMarkPaid={(loan) => setMarkPaidLoan(loan)}
                      onEdit={openEdit}
                      onDelete={(loan) => setDeletingLoan(loan)}
                      onUnmarkPaid={(id) => void handleUnmarkPaid(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

        </>
      )}

      {/* Lending flow analytics — understand and heal your finances */}
      {hasFlowData && (
        <div className="flex flex-col gap-2 px-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Flujo de préstamos
          </p>
          <Card className="p-3.5">
            <p className="mb-2 text-[11px] leading-snug text-text-secondary">
              Cuánto prestas vs cuánto recuperas cada mes. La línea roja es lo que
              te deben al cierre — si no baja, es momento de cobrar.
            </p>
            <LoanFlowChart data={loanFlow} />
          </Card>
        </div>
      )}

      {/* ── Modals ── */}
      <LoanFormModal
        open={loanFormOpen}
        onClose={() => { setLoanFormOpen(false); setEditingLoan(null) }}
        defaultDirection={formDefaultDir}
        editingLoan={editingLoan}
        existingNames={allNames}
        onCreate={async (data) => {
          // Stamp the loan into the contact's group when one exists, so the
          // group↔loan link doesn't depend on exact name matching alone.
          const contactKey = data.name.trim().toLowerCase()
          const directGroup = splitGroups.find(
            (g) =>
              !g.isConnected &&
              g.members.length === 2 &&
              g.members.some((m) => !m.is_me && m.name.trim().toLowerCase() === contactKey),
          )
          await create({ ...data, group_id: directGroup?.group.id ?? null })
          toast.success('Préstamo registrado', `Guardaste un préstamo con ${data.name}`)
        }}
        onEdit={async (id, patch) => {
          const prev = allLoans.find((l) => l.id === id)
          await update(id, patch)
          // Keep the direct group coherent when the contact is renamed:
          // if the group carries the old contact name, rename it too so
          // history and navigation stay attached (best effort).
          if (prev && patch.name && patch.name.trim().toLowerCase() !== prev.name.trim().toLowerCase()) {
            const direct = directGroupByContact.get(prev.name.trim().toLowerCase())
            if (direct) {
              try {
                const contactMember = direct.members.find((m) => !memberIsMe(m, user?.id))
                if (contactMember) {
                  await supabase
                    .from('split_members')
                    .update({ name: patch.name.trim() })
                    .eq('id', contactMember.id)
                }
                if (direct.group.name.trim().toLowerCase() === prev.name.trim().toLowerCase()) {
                  await supabase
                    .from('split_groups')
                    .update({ name: patch.name.trim() })
                    .eq('id', direct.group.id)
                }
              } catch {
                // Non-blocking: the loan itself is already stamped by id.
              }
            }
          }
          toast.success('Cambios guardados', 'El préstamo fue actualizado')
        }}
      />

      {abonoLoan && (
        <AbonoModal
          open
          loan={abonoLoan}
          payments={paymentsByLoan[abonoLoan.id] ?? []}
          onClose={() => setAbonoLoan(null)}
          onSubmit={async (amount, opts) => {
            await addPayment(abonoLoan.id, amount, opts)
            toast.success('Abono registrado', `Abono de ${formatMXN(amount)} guardado`)
            setAbonoLoan(null)
          }}
        />
      )}

      {markPaidLoan && (
        <MarkPaidModal
          open
          loan={markPaidLoan}
          payments={paymentsByLoan[markPaidLoan.id] ?? []}
          onClose={() => setMarkPaidLoan(null)}
          onSubmit={async (opts) => {
            await markPaid(markPaidLoan.id, opts)
            toast.success('Préstamo saldado', `El préstamo de ${markPaidLoan.name} está saldado`)
            setMarkPaidLoan(null)
          }}
        />
      )}

      <ConfirmModal
        open={!!deletingLoan}
        title="Eliminar préstamo"
        message={`¿Eliminar el préstamo de ${deletingLoan?.name ?? ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setDeletingLoan(null)}
      />

      {settleAllContact && (
        <SettleAllModal
          open
          contactName={settleAllContact.name}
          net={settleAllContact.net}
          breakdown={settleAllContact.breakdown}
          onClose={() => setSettleAllContact(null)}
          onConfirm={handleSettleAll}
        />
      )}

      {/* Inline shared-expense editing — same capabilities as the group detail */}
      {inlineExpense && inlineExpenseGroup && (
        <ExpenseFormModal
          open
          onClose={() => setInlineExpense(null)}
          members={inlineExpenseGroup.activeMembers.map((m) => ({ ...m, name: displayName(m) }))}
          editing={{
            expense: inlineExpense,
            shares: inlineExpenseGroup.sharesByExpense.get(inlineExpense.id) ?? [],
          }}
          onSubmit={async (exp) => {
            await updateExpense(inlineExpense.id, inlineExpense.group_id, exp)
            toast.success('Gasto actualizado', `${exp.description} · ${formatMXN(exp.amount)}`)
          }}
        />
      )}

      {/* Add a shared expense to a group without leaving the list */}
      {addExpenseGroupId && addExpenseGroup && (
        <ExpenseFormModal
          open
          onClose={() => setAddExpenseGroupId(null)}
          members={addExpenseGroup.activeMembers.map((m) => ({ ...m, name: displayName(m) }))}
          onSubmit={async (exp) => {
            await addExpense(addExpenseGroupId, exp)
            toast.success('Gasto registrado', `${exp.description} · ${formatMXN(exp.amount)}`)
          }}
        />
      )}

      <ConfirmModal
        open={!!deletingSplitExpense}
        title="Eliminar gasto"
        message={`¿Eliminar "${deletingSplitExpense?.description ?? ''}"? Si se registró en una cuenta, el movimiento no se revierte automáticamente.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteSplitExpense()}
        onClose={() => setDeletingSplitExpense(null)}
      />

      <ConfirmModal
        open={!!deletingSplitSettlement}
        title="Eliminar liquidación"
        message="Se restaurarán los balances. Abonos a préstamos y movimientos de cuenta creados junto con esta liquidación NO se revierten automáticamente."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => void handleDeleteSplitSettlement()}
        onClose={() => setDeletingSplitSettlement(null)}
      />

      <GroupFormModal
        open={groupFormOpen}
        onClose={() => setGroupFormOpen(false)}
        recentContacts={recentContacts}
        onCreate={async (name, memberDrafts) => {
          const { id } = await createGroup(name, memberDrafts)
          const linked = memberDrafts.filter((m) => m.memberUserId).length
          toast.success(
            'Grupo creado',
            linked > 0
              ? `${name} · ${linked} contacto${linked === 1 ? '' : 's'} conectado${linked === 1 ? '' : 's'} ya lo ve${linked === 1 ? '' : 'n'}`
              : `${name} · ${memberDrafts.length + 1} personas`,
          )
          void navigate(`/cuentas/prestamos/${id}`)
        }}
      />
    </div>
  )
}

// ── LoanFormModal ─────────────────────────────────────────────────────────────

function LoanFormModal({
  open,
  onClose,
  defaultDirection,
  editingLoan,
  existingNames,
  onCreate,
  onEdit,
}: {
  open: boolean
  onClose: () => void
  defaultDirection: LoanDirection
  editingLoan: Loan | null
  existingNames: string[]
  onCreate: (data: NewLoan) => Promise<void>
  onEdit: (id: string, patch: Partial<NewLoan>) => Promise<void>
}) {
  const isEdit = editingLoan !== null

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [direction, setDirection] = useState<LoanDirection>(defaultDirection)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      setName(editingLoan?.name ?? '')
      setAmount(editingLoan ? String(editingLoan.amount) : '')
      setNotes(editingLoan?.notes ?? '')
      setDirection(editingLoan?.direction ?? defaultDirection)
      setFormError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (!name.trim()) { setFormError('Escribe un nombre'); return }
    if (!amount || Number.isNaN(num) || num <= 0) { setFormError('Escribe un monto válido'); return }
    setSubmitting(true)
    try {
      if (isEdit) {
        await onEdit(editingLoan.id, {
          name: name.trim(),
          amount: num,
          notes: notes.trim() || null,
          direction,
        })
      } else {
        await onCreate({ name: name.trim(), amount: num, notes: notes.trim() || null, direction })
      }
      onClose()
    } catch {
      setFormError('No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar préstamo' : 'Nuevo préstamo'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Direction toggle */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-text">Tipo</p>
          <div className="flex overflow-hidden rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setDirection('owed_to_me')}
              className={clsx(
                'flex-1 py-2.5 text-[13px] font-bold transition-colors',
                direction === 'owed_to_me'
                  ? 'bg-primary text-white'
                  : 'bg-bg text-text-secondary hover:bg-primary/5',
              )}
            >
              Me deben
            </button>
            <button
              type="button"
              onClick={() => setDirection('i_owe')}
              className={clsx(
                'flex-1 py-2.5 text-[13px] font-bold transition-colors',
                direction === 'i_owe'
                  ? 'bg-debt text-white'
                  : 'bg-bg text-text-secondary hover:bg-debt/5',
              )}
            >
              Yo debo
            </button>
          </div>
        </div>

        {/* Name with autocomplete */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="loan-name-input" className="text-sm font-medium text-text">
            {direction === 'owed_to_me' ? '¿Quién te debe?' : '¿A quién le debes?'}
          </label>
          <input
            id="loan-name-input"
            list="loan-names-list"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-border bg-bg-elevated px-4 text-base text-text placeholder:text-text-tertiary transition-all hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <datalist id="loan-names-list">
            {existingNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        <Input
          label="Monto"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0.01"
          step="any"
        />

        <Input
          label="Concepto (opcional)"
          placeholder="Para el celular, comida de ayer…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          {isEdit ? 'Guardar cambios' : 'Registrar préstamo'}
        </Button>
      </form>
    </Modal>
  )
}
