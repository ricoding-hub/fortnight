import { useState } from 'react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { LoanRow } from '@/components/split/LoanRow'
import { formatMXN } from '@/lib/format'
import type { Loan, LoanPayment } from '@/types'

interface ContactLoansModalProps {
  open: boolean
  onClose: () => void
  name: string
  avatarUrl?: string
  /** Positive = they owe me. */
  net: number
  activeLoans: Loan[]
  paidLoans: Loan[]
  paymentsByLoan: Record<string, LoanPayment[]>
  onOpenLoan: (loan: Loan) => void
  onAbono: (loan: Loan) => void
  onMarkPaid: (loan: Loan) => void
  onEdit: (loan: Loan) => void
  onDelete: (loan: Loan) => void
  onUnmarkPaid: (loan: Loan) => void
}

/**
 * Every loan with one person, without needing a split group to exist. This is
 * the detail path for local/offline contacts: it reads what is already loaded
 * and writes nothing, so it works even before the split migrations are applied.
 */
export function ContactLoansModal({
  open,
  onClose,
  name,
  avatarUrl,
  net,
  activeLoans,
  paidLoans,
  paymentsByLoan,
  onOpenLoan,
  onAbono,
  onMarkPaid,
  onEdit,
  onDelete,
  onUnmarkPaid,
}: ContactLoansModalProps) {
  const [showPaid, setShowPaid] = useState(false)

  const rowProps = (loan: Loan) => ({
    loan,
    payments: paymentsByLoan[loan.id] ?? [],
    onOpenDetail: () => onOpenLoan(loan),
    onAbono: () => onAbono(loan),
    onMarkPaid: () => onMarkPaid(loan),
    onEdit: () => onEdit(loan),
    onDelete: () => onDelete(loan),
    onUnmarkPaid: () => onUnmarkPaid(loan),
  })

  return (
    <Modal open={open} onClose={onClose} title={name}>
      <div className="flex flex-col gap-4">
        {/* Net header */}
        <div className="flex items-center gap-3 rounded-xl bg-bg-secondary/50 px-4 py-3">
          <Avatar name={name} avatarUrl={avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-text">{name}</p>
            <p
              className={clsx(
                'font-mono text-[13px] font-bold tabular-nums',
                net > 0.005 ? 'text-asset-deep' : net < -0.005 ? 'text-debt-deep' : 'text-text-tertiary',
              )}
            >
              {Math.abs(net) < 0.005
                ? 'En paz'
                : net > 0
                  ? `Te debe ${formatMXN(net)}`
                  : `Le debes ${formatMXN(Math.abs(net))}`}
            </p>
          </div>
        </div>

        {/* Active loans */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Activos ({activeLoans.length})
          </p>
          {activeLoans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-center text-[12px] text-text-tertiary">
              Sin préstamos activos con {name}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activeLoans.map((l) => (
                <li key={l.id}>
                  <LoanRow compact {...rowProps(l)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Settled loans */}
        {paidLoans.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowPaid((v) => !v)}
              className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-primary transition-colors hover:text-primary-deep"
            >
              {showPaid ? 'Ocultar saldados' : `Ver saldados (${paidLoans.length})`}
            </button>
            {showPaid && (
              <ul className="flex flex-col gap-1.5 animate-[fade-in_200ms_ease-out]">
                {paidLoans.map((l) => (
                  <li key={l.id}>
                    <LoanRow compact {...rowProps(l)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
