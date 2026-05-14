import { useState } from 'react'
import {
  IconPlus,
  IconCheck,
  IconUsers,
  IconCurrencyDollar,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { useLoans } from '@/hooks/useLoans'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/hooks/useToast'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/StatCard'
import { formatMXN, formatDateMX } from '@/lib/format'
import type { Loan } from '@/types'

/** First letter avatar for debtor name. */
function initial(name: string) {
  return (name[0] ?? '?').toUpperCase()
}

function LoanRow({
  loan,
  onMarkPaid,
}: {
  loan: Loan
  onMarkPaid: (id: string) => Promise<void>
}) {
  const isPaid = loan.paid_at != null
  const [marking, setMarking] = useState(false)

  const toast = useToast()

  async function handlePaid() {
    setMarking(true)
    try {
      await onMarkPaid(loan.id)
      toast.success('Préstamo pagado', `El préstamo de ${loan.name} ha sido saldado`)
    } catch {
      toast.error('Error', 'No se pudo actualizar el préstamo')
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-3.5">
      <div
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
          isPaid
            ? 'bg-asset/10 text-asset'
            : 'bg-primary/10 text-primary',
        )}
      >
        {initial(loan.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-text">{loan.name}</p>
          {isPaid && <Badge variant="success">Pagado</Badge>}
        </div>
        {loan.notes && (
          <p className="truncate text-xs text-text-secondary">{loan.notes}</p>
        )}
        <p className="text-[10px] text-text-tertiary">
          {formatDateMX(loan.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'text-sm font-bold tabular-nums',
            isPaid ? 'text-text-tertiary line-through' : 'text-text',
          )}
        >
          {formatMXN(loan.amount)}
        </span>
        {!isPaid && (
          <button
            type="button"
            onClick={() => void handlePaid()}
            disabled={marking}
            aria-label={`Marcar como pagado: ${loan.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-asset/10 text-asset transition-colors hover:bg-asset/20 disabled:opacity-50"
          >
            <IconCheck size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

export function Prestamos() {
  const { active, paid, loading, error, create, markPaid } = useLoans()
  const [modalOpen, setModalOpen] = useState(false)
  const [showPaid, setShowPaid] = useState(false)

  const porCobrar = active.reduce((s, l) => s + l.amount, 0)
  const cobrados = paid.reduce((s, l) => s + l.amount, 0)

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4 animate-[fade-in_300ms_ease-out]">
        <div className="h-5 w-24 rounded shimmer" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-debt/20 bg-debt/5">
          <p className="text-sm font-medium text-debt">
            No se pudieron cargar los préstamos.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      <header className="px-4 pb-2 pt-4 lg:pt-2">
        <h1 className="text-lg font-bold text-text">Préstamos</h1>
        <p className="text-xs text-text-secondary">Dinero que te deben</p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-4 py-2">
        <StatCard
          label="Por cobrar"
          value={formatMXN(porCobrar)}
          tone="primary"
          icon={IconCurrencyDollar}
        />
        <StatCard
          label="Cobrado"
          value={formatMXN(cobrados)}
          tone="asset"
          icon={IconCheck}
        />
      </div>

      {active.length === 0 && paid.length === 0 ? (
        <EmptyState
          icon={IconUsers}
          title="Sin préstamos"
          description="Cuando le prestes dinero a alguien, regístralo aquí para no olvidarlo."
          action={
            <Button compact onClick={() => setModalOpen(true)}>
              <IconPlus size={16} /> Agregar préstamo
            </Button>
          }
        />
      ) : (
        <>
          {/* Active loans */}
          <div className="px-4 py-2">
            <Card className="px-4 py-1">
              {active.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-secondary">
                  Todos los préstamos están pagados. ¡Bien!
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {active.map((l) => (
                    <li key={l.id}>
                      <LoanRow loan={l} onMarkPaid={markPaid} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Paid loans toggle */}
          {paid.length > 0 && (
            <div className="px-4 py-2">
              <button
                type="button"
                onClick={() => setShowPaid(!showPaid)}
                className="mb-2 text-xs font-medium text-primary transition-colors hover:text-primary-deep"
              >
                {showPaid ? 'Ocultar pagados' : `Ver pagados (${paid.length})`}
              </button>
              {showPaid && (
                <Card className="px-4 py-1 animate-[scale-in_200ms_ease-out]">
                  <ul className="divide-y divide-border">
                    {paid.map((l) => (
                      <li key={l.id}>
                        <LoanRow loan={l} onMarkPaid={markPaid} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}

          {/* Add button */}
          <div className="px-4 py-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
            >
              <IconPlus size={16} /> Agregar préstamo
            </button>
          </div>
        </>
      )}

      {/* Create modal */}
      <LoanFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={create}
      />
    </div>
  )
}

// ── Loan create form ───────────────────────────────────────────

function LoanFormModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (data: { name: string; amount: number; notes: string | null }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toast = useToast()

  function close() {
    setName('')
    setAmount('')
    setNotes('')
    setError('')
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (!name.trim()) {
      setError('Escribe un nombre')
      return
    }
    if (!amount || Number.isNaN(num) || num <= 0) {
      setError('Escribe un monto válido')
      return
    }
    setSubmitting(true)
    try {
      await onCreate({
        name: name.trim(),
        amount: num,
        notes: notes.trim() || null,
      })
      toast.success('Préstamo registrado', `Guardaste un préstamo de ${name.trim()}`)
      close()
    } catch {
      setError('No se pudo guardar')
      toast.error('Error al guardar', 'Hubo un problema al guardar el préstamo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Nuevo préstamo">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="¿A quién le prestaste?"
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Input
          label="Monto"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          label="Notas"
          placeholder="Opcional"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && (
          <p className="text-xs text-debt">
            <span aria-hidden="true">•</span> {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="mt-1">
          Guardar préstamo
        </Button>
      </form>
    </Modal>
  )
}
