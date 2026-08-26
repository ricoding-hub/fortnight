import { useState } from 'react'
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconEdit,
  IconTrash,
  IconArrowBackUp,
  IconPlus,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { loanRemaining } from '@/hooks/useLoans'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { loanDateHint } from '@/lib/loanFormat'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import type { Loan, LoanPayment } from '@/types'

interface LoanDetailModalProps {
  open: boolean
  onClose: () => void
  loan: Loan | null
  payments: LoanPayment[]
  onAbono?: () => void
  onMarkPaid?: () => void
  onUnmarkPaid?: () => void
  onEdit?: () => void
  onDelete?: () => void
  /** Remove a single payment (fixes a mistyped abono). */
  onDeletePayment?: (paymentId: string) => Promise<void>
}

/**
 * Everything about one loan in one place: how much is left of how much, the
 * concept, the dates, every abono registered, and all the actions. This is the
 * detail that the balances redesign left unreachable.
 */
export function LoanDetailModal({
  open,
  onClose,
  loan,
  payments,
  onAbono,
  onMarkPaid,
  onUnmarkPaid,
  onEdit,
  onDelete,
  onDeletePayment,
}: LoanDetailModalProps) {
  const [deletingPayment, setDeletingPayment] = useState<LoanPayment | null>(null)

  if (!loan) return null

  const isPaid = loan.paid_at != null
  const owedToMe = loan.direction === 'owed_to_me'
  const total = Number(loan.amount)
  const remaining = loanRemaining(loan, payments)
  const paidAmount = total - remaining
  const paidPercent = total > 0 ? Math.round((paidAmount / total) * 100) : 0

  return (
    <Modal open={open} onClose={onClose} title="Detalle del préstamo">
      <div className="flex flex-col gap-4">
        {/* Who + direction + amount */}
        <div className="rounded-xl bg-bg-secondary/50 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                owedToMe ? 'bg-primary/10 text-primary-deep' : 'bg-debt/10 text-debt-deep',
              )}
            >
              {owedToMe ? <IconArrowDown size={22} stroke={2.2} /> : <IconArrowUp size={22} stroke={2.2} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold text-text">{loan.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={owedToMe ? 'info' : 'danger'}>{owedToMe ? 'Te deben' : 'Debes'}</Badge>
                {isPaid && <Badge variant="success">Saldado</Badge>}
              </div>
            </div>
            <span
              className={clsx(
                'shrink-0 font-mono text-[17px] font-extrabold tabular-nums',
                isPaid ? 'text-text-tertiary line-through' : 'text-text',
              )}
            >
              {formatMXN(remaining)}
            </span>
          </div>

          {!isPaid && paidAmount > 0 && (
            <>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${paidPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-text-tertiary">
                Abonado {formatMXN(paidAmount)} de {formatMXN(total)} · {paidPercent}%
              </p>
            </>
          )}
          {(isPaid || paidAmount === 0) && (
            <p className="mt-2 text-[11px] font-semibold text-text-tertiary">
              Monto original {formatMXN(total)}
            </p>
          )}
        </div>

        {/* Concept + dates */}
        <div className="flex flex-col gap-2 px-1">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-text-secondary">Concepto</span>
            <span className="min-w-0 flex-1 text-right text-[13px] font-bold text-text">
              {loan.notes?.trim() || <span className="font-normal text-text-tertiary">Sin concepto</span>}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-text-secondary">Registrado</span>
            <span className="text-[13px] font-bold text-text">{formatDateGroupMX(loan.created_at)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-text-secondary">Estado</span>
            <span className="text-[13px] font-bold text-text">{loanDateHint(loan, payments)}</span>
          </div>
        </div>

        {/* Payment history */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Abonos ({payments.length})
          </p>
          {payments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-center text-[12px] text-text-tertiary">
              Todavía no hay abonos registrados
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-text">
                      {p.note?.trim() || 'Abono'}
                    </p>
                    <p className="text-[10.5px] text-text-tertiary">{formatDateGroupMX(p.created_at)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[13px] font-bold text-asset-deep">
                    {formatMXN(Number(p.amount))}
                  </span>
                  {onDeletePayment && (
                    <button
                      type="button"
                      onClick={() => setDeletingPayment(p)}
                      aria-label="Eliminar abono"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!isPaid && (
            <div className="flex gap-2">
              {onAbono && (
                <button
                  type="button"
                  onClick={onAbono}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2.5 text-[12.5px] font-bold text-primary-deep transition-transform hover:bg-primary/20 active:scale-[0.97]"
                >
                  <IconPlus size={14} /> Abonar
                </button>
              )}
              {onMarkPaid && (
                <button
                  type="button"
                  onClick={onMarkPaid}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-asset/10 py-2.5 text-[12.5px] font-bold text-asset-deep transition-transform hover:bg-asset/20 active:scale-[0.97]"
                >
                  <IconCheck size={14} /> Saldar
                </button>
              )}
            </div>
          )}
          {isPaid && onUnmarkPaid && (
            <button
              type="button"
              onClick={onUnmarkPaid}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-bg-secondary py-2.5 text-[12.5px] font-bold text-text-secondary transition-transform hover:bg-border active:scale-[0.97]"
            >
              <IconArrowBackUp size={14} /> Recuperar
            </button>
          )}
          <div className="flex gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-bg-secondary py-2.5 text-[12.5px] font-bold text-text-secondary transition-transform hover:bg-border active:scale-[0.97]"
              >
                <IconEdit size={14} /> Editar
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-debt/10 py-2.5 text-[12.5px] font-bold text-debt-deep transition-transform hover:bg-debt/20 active:scale-[0.97]"
              >
                <IconTrash size={14} /> Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={deletingPayment != null}
        title="Eliminar abono"
        message={
          deletingPayment
            ? `Se eliminará el abono de ${formatMXN(Number(deletingPayment.amount))} y el saldo pendiente volverá a subir.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (deletingPayment && onDeletePayment) void onDeletePayment(deletingPayment.id)
        }}
        onClose={() => setDeletingPayment(null)}
      />
    </Modal>
  )
}
