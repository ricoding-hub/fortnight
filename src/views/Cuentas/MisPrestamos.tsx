import { useEffect, useMemo, useState } from 'react'
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconEdit,
  IconPlus,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { useLoans, loanRemaining, type NewLoan } from '@/hooks/useLoans'
import { useAccounts } from '@/hooks/useAccounts'
import { useToast } from '@/hooks/useToast'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { StatCard } from '@/components/StatCard'
import { formatMXN } from '@/lib/format'
import type { Loan, LoanDirection, LoanPayment } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}k`
  return formatMXN(n)
}

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
  const [menuOpen, setMenuOpen] = useState(false)
  const remaining = loanRemaining(loan, payments)
  const hasPayments = payments.length > 0
  const paidPercent =
    Number(loan.amount) > 0
      ? Math.round((1 - remaining / Number(loan.amount)) * 100)
      : 0

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
          <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
            <span
              className={clsx(
                'text-sm font-bold tabular-nums',
                isPaidSection ? 'text-text-tertiary line-through' : 'text-text',
              )}
            >
              {formatMXN(Number(loan.amount))}
            </span>
            {!isPaidSection && hasPayments && remaining < Number(loan.amount) && (
              <span className="text-[11px] text-text-tertiary">
                · resta {formatMXN(remaining)}
              </span>
            )}
          </div>
          {!isPaidSection && hasPayments && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Actions toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors',
            menuOpen ? 'bg-primary/10 text-primary' : 'hover:bg-bg-secondary',
          )}
          aria-label="Acciones"
        >
          <IconDots size={16} />
        </button>
      </div>

      {/* Inline action buttons */}
      {menuOpen && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
          {!isPaidSection && (
            <>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onAbono() }}
                className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-primary-deep transition-colors hover:bg-primary/20"
              >
                + Abono
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onMarkPaid() }}
                className="flex items-center gap-1 rounded-lg bg-asset/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-asset-deep transition-colors hover:bg-asset/20"
              >
                <IconCheck size={12} /> Saldado
              </button>
            </>
          )}
          {isPaidSection && (
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onUnmarkPaid() }}
              className="rounded-lg bg-bg-secondary px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-border"
            >
              Desmarcar
            </button>
          )}
          <button
            type="button"
            onClick={() => { setMenuOpen(false); onEdit() }}
            className="flex items-center gap-1 rounded-lg bg-bg-secondary px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-border"
          >
            <IconEdit size={12} /> Editar
          </button>
          <button
            type="button"
            onClick={() => { setMenuOpen(false); onDelete() }}
            className="flex items-center gap-1 rounded-lg bg-debt/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-debt transition-colors hover:bg-debt/20"
          >
            <IconTrash size={12} /> Eliminar
          </button>
        </div>
      )}
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
}: {
  group: ContactGroup
  paymentsByLoan: Record<string, LoanPayment[]>
  isPaidSection?: boolean
  onAbono: (loan: Loan) => void
  onMarkPaid: (loan: Loan) => void
  onEdit: (loan: Loan) => void
  onDelete: (loan: Loan) => void
  onUnmarkPaid: (loanId: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const avatarColor = nameColorClass(group.name)

  return (
    <Card className="overflow-hidden px-4 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 py-2"
      >
        <div
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
            avatarColor,
          )}
        >
          {(group.name[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-semibold text-text">{group.name}</p>
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
        </ul>
      )}
    </Card>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MisPrestamos() {
  const {
    active,
    paid,
    paymentsByLoan,
    porCobrar,
    porPagar,
    saldados,
    loading,
    error,
    create,
    update,
    markPaid,
    unmarkPaid,
    deleteLoan,
    addPayment,
  } = useLoans()
  const toast = useToast()

  const [loanFormOpen, setLoanFormOpen] = useState(false)
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
      .map((loans) => ({
        name: loans[0].name,
        loans,
        net: loans.reduce((s, l) => {
          const rem = loanRemaining(l, paymentsByLoan[l.id] ?? [])
          return l.direction === 'owed_to_me' ? s + rem : s - rem
        }, 0),
      }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  }, [active, paymentsByLoan])

  const paidGroups = useMemo<ContactGroup[]>(() => {
    const map = new Map<string, Loan[]>()
    for (const l of paid) {
      const key = l.name.trim().toLowerCase()
      map.set(key, [...(map.get(key) ?? []), l])
    }
    return Array.from(map.values()).map((loans) => ({
      name: loans[0].name,
      loans,
      net: 0,
    }))
  }, [paid])

  const allNames = useMemo(() => {
    const names = new Set([...active, ...paid].map((l) => l.name.trim()))
    return Array.from(names).sort()
  }, [active, paid])

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

  const hasAny = active.length > 0 || paid.length > 0

  return (
    <div className="flex flex-col gap-3 pb-24 animate-[fade-in_300ms_ease-out]">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-2">
        <StatCard
          label="Por cobrar"
          value={fmtCompact(porCobrar)}
          tone="primary"
          icon={IconArrowDown}
        />
        <StatCard
          label="Por pagar"
          value={fmtCompact(porPagar)}
          tone="debt"
          icon={IconArrowUp}
        />
        <StatCard
          label="Saldados"
          value={fmtCompact(saldados)}
          tone="asset"
          icon={IconCheck}
        />
      </div>

      {!hasAny ? (
        <div className="px-4">
          <EmptyState
            icon={IconUsers}
            title="Sin préstamos"
            description="Registra lo que te deben o lo que debes para no perder el hilo."
            action={
              <div className="flex gap-2">
                <Button compact onClick={() => openCreate('owed_to_me')}>
                  <IconArrowDown size={14} /> Me deben
                </Button>
                <Button compact variant="secondary" onClick={() => openCreate('i_owe')}>
                  <IconArrowUp size={14} /> Yo debo
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* Active contact groups */}
          {activeGroups.length > 0 && (
            <div className="flex flex-col gap-2 px-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                Activos
              </p>
              {activeGroups.map((g) => (
                <ContactGroupCard
                  key={g.name.toLowerCase()}
                  group={g}
                  paymentsByLoan={paymentsByLoan}
                  onAbono={(loan) => setAbonoLoan(loan)}
                  onMarkPaid={(loan) => setMarkPaidLoan(loan)}
                  onEdit={openEdit}
                  onDelete={(loan) => setDeletingLoan(loan)}
                  onUnmarkPaid={(id) => void handleUnmarkPaid(id)}
                />
              ))}
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

          {/* Add loan button */}
          <div className="px-4">
            <button
              type="button"
              onClick={() => openCreate()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]"
            >
              <IconPlus size={16} /> Agregar préstamo
            </button>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      <LoanFormModal
        open={loanFormOpen}
        onClose={() => { setLoanFormOpen(false); setEditingLoan(null) }}
        defaultDirection={formDefaultDir}
        editingLoan={editingLoan}
        existingNames={allNames}
        onCreate={async (data) => {
          await create(data)
          toast.success('Préstamo registrado', `Guardaste un préstamo con ${data.name}`)
        }}
        onEdit={async (id, patch) => {
          await update(id, patch)
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

// ── AbonoModal ────────────────────────────────────────────────────────────────

function AbonoModal({
  open,
  loan,
  payments,
  onClose,
  onSubmit,
}: {
  open: boolean
  loan: Loan
  payments: LoanPayment[]
  onClose: () => void
  onSubmit: (
    amount: number,
    opts?: { accountId?: string | null; note?: string | null },
  ) => Promise<void>
}) {
  const { data: accounts } = useAccounts()
  const remaining = loanRemaining(loan, payments)

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      setAmount('')
      setNote('')
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
    }
  }, [open])

  const amountNum = Number(amount)
  const afterAbono = Math.max(0, remaining - (amountNum > 0 ? amountNum : 0))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setFormError('Escribe un monto válido')
      return
    }
    if (amountNum > remaining) {
      setFormError(`El monto no puede superar el saldo pendiente (${formatMXN(remaining)})`)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(amountNum, {
        accountId: linkAccount ? (accountId || null) : null,
        note: note.trim() || null,
      })
    } catch {
      setFormError('No se pudo registrar el abono')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Abono · ${loan.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="rounded-xl bg-bg-secondary px-3.5 py-2.5">
          <p className="text-[11px] text-text-tertiary">Saldo pendiente</p>
          <p className="text-base font-bold text-text">{formatMXN(remaining)}</p>
        </div>

        <Input
          label="Monto del abono"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          min="0.01"
          step="any"
        />

        {amountNum > 0 && amountNum <= remaining && (
          <div className="rounded-xl bg-primary/5 px-3.5 py-2">
            <p className="text-[12px] text-primary-deep">
              Quedará pendiente: <strong>{formatMXN(afterAbono)}</strong>
            </p>
          </div>
        )}

        <Input
          label="Nota (opcional)"
          placeholder="Transferencia del 1 ene…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* Account link toggle */}
        <label className="flex cursor-pointer items-center gap-3">
          <div
            role="switch"
            aria-checked={linkAccount}
            tabIndex={0}
            onClick={() => {
              const next = !linkAccount
              setLinkAccount(next)
              if (next && !accountId && accounts.length > 0) {
                setAccountId(accounts[0].id)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                const next = !linkAccount
                setLinkAccount(next)
                if (next && !accountId && accounts.length > 0) {
                  setAccountId(accounts[0].id)
                }
              }
            }}
            className={clsx(
              'relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              linkAccount ? 'bg-primary' : 'bg-border',
            )}
          >
            <div
              className={clsx(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                linkAccount ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </div>
          <span className="text-sm font-medium text-text">Registrar en cuenta</span>
        </label>

        {linkAccount && accounts.length > 0 && (
          <Select
            label="Cuenta"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Registrar abono
        </Button>
      </form>
    </Modal>
  )
}

// ── MarkPaidModal ─────────────────────────────────────────────────────────────

function MarkPaidModal({
  open,
  loan,
  payments,
  onClose,
  onSubmit,
}: {
  open: boolean
  loan: Loan
  payments: LoanPayment[]
  onClose: () => void
  onSubmit: (opts?: { accountId?: string | null; amount?: number }) => Promise<void>
}) {
  const { data: accounts } = useAccounts()
  const remaining = loanRemaining(loan, payments)

  const [amount, setAmount] = useState('')
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      setAmount(String(remaining))
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (linkAccount && (!amount || Number.isNaN(num) || num <= 0)) {
      setFormError('Escribe un monto válido')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        accountId: linkAccount ? (accountId || null) : null,
        amount: linkAccount ? num : undefined,
      })
    } catch {
      setFormError('No se pudo saldar el préstamo')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Saldar · ${loan.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="rounded-xl bg-bg-secondary px-3.5 py-2.5">
          <p className="text-[11px] text-text-tertiary">Saldo pendiente</p>
          <p className="text-base font-bold text-text">{formatMXN(remaining)}</p>
        </div>

        {/* Account link toggle */}
        <label className="flex cursor-pointer items-center gap-3">
          <div
            role="switch"
            aria-checked={linkAccount}
            tabIndex={0}
            onClick={() => {
              const next = !linkAccount
              setLinkAccount(next)
              if (next && !accountId && accounts.length > 0) {
                setAccountId(accounts[0].id)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                const next = !linkAccount
                setLinkAccount(next)
                if (next && !accountId && accounts.length > 0) {
                  setAccountId(accounts[0].id)
                }
              }
            }}
            className={clsx(
              'relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              linkAccount ? 'bg-primary' : 'bg-border',
            )}
          >
            <div
              className={clsx(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                linkAccount ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </div>
          <span className="text-sm font-medium text-text">Registrar en cuenta</span>
        </label>

        {linkAccount && (
          <>
            <Input
              label="Monto a registrar"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              step="any"
            />
            {accounts.length > 0 && (
              <Select
                label="Cuenta"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </>
        )}

        <div className="rounded-xl bg-asset/10 px-3.5 py-2.5">
          <p className="text-[12px] font-medium text-asset-deep">
            El préstamo quedará marcado como saldado
          </p>
        </div>

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Confirmar
        </Button>
      </form>
    </Modal>
  )
}
