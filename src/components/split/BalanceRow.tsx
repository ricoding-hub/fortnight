import { useState } from 'react'
import {
  IconChevronDown,
  IconChevronRight,
  IconCheck,
  IconArrowRight,
  IconListDetails,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { LoanRow } from '@/components/split/LoanRow'
import { SplitMovementRow } from '@/components/split/SplitMovementRow'
import { formatMXN } from '@/lib/format'
import type { BalanceEntry } from '@/hooks/usePeopleBalances'
import type { Loan, LoanPayment } from '@/types'

interface BalanceRowProps {
  entry: BalanceEntry
  /** Denser padding for Home. Rows still expand in both modes. */
  compact?: boolean
  /** How many active items (loans + movements) to list before "ver más". */
  maxItems?: number
  paymentsByLoan?: Record<string, LoanPayment[]>
  /** Open the person/group detail (button next to the chevron). */
  onOpen?: () => void
  /** Settle the whole relationship. */
  onSettle?: () => void
  onOpenLoan?: (loan: Loan) => void
  onAbonoLoan?: (loan: Loan) => void
  onMarkPaidLoan?: (loan: Loan) => void
  onEditLoan?: (loan: Loan) => void
  onDeleteLoan?: (loan: Loan) => void
  onUnmarkPaidLoan?: (loan: Loan) => void
}

function netColor(net: number): string {
  if (net > 0.005) return 'text-asset-deep'
  if (net < -0.005) return 'text-debt-deep'
  return 'text-text-tertiary'
}

/** First-person label for MY position with a person/group. */
function netLabel(entry: BalanceEntry): string {
  const abs = formatMXN(Math.abs(entry.net))
  if (Math.abs(entry.net) < 0.005) return 'En paz'
  const plural = entry.kind === 'group'
  if (entry.net > 0) return plural ? `Te deben ${abs}` : `Te debe ${abs}`
  return plural ? `Debes ${abs}` : `Le debes ${abs}`
}

/** Third-person label for a member's own position inside a group. */
function memberLabel(net: number): string {
  const abs = formatMXN(Math.abs(net))
  if (Math.abs(net) < 0.005) return 'En paz'
  return net > 0 ? `recupera ${abs}` : `debe ${abs}`
}

export function BalanceRow({
  entry,
  compact = false,
  maxItems,
  paymentsByLoan = {},
  onOpen,
  onSettle,
  onOpenLoan,
  onAbonoLoan,
  onMarkPaidLoan,
  onEditLoan,
  onDeleteLoan,
  onUnmarkPaidLoan,
}: BalanceRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAllActive, setShowAllActive] = useState(false)
  const [showPaid, setShowPaid] = useState(false)
  const color = netColor(entry.net)

  // Group edges reference member ids; fall back to the entry name so a 1:1
  // transfer never renders as a dash.
  const nameById = new Map((entry.memberBalances ?? []).map((m) => [m.id, m.name]))
  const resolveName = (id: string) => nameById.get(id) ?? entry.name

  // Open loans and shared movements share one budget: loans first (they carry
  // actions), movements fill whatever is left.
  const limit = maxItems ?? Number.MAX_SAFE_INTEGER
  const visibleLoans = showAllActive ? entry.loans : entry.loans.slice(0, limit)
  const movementBudget = Math.max(0, limit - visibleLoans.length)
  const visibleMovements = showAllActive ? entry.movements : entry.movements.slice(0, movementBudget)
  const hiddenActive =
    entry.loans.length - visibleLoans.length + (entry.movements.length - visibleMovements.length)
  const hasActive = visibleLoans.length > 0 || visibleMovements.length > 0

  const loanRowProps = (loan: Loan) => ({
    loan,
    payments: paymentsByLoan[loan.id] ?? [],
    compact: true,
    onOpenDetail: onOpenLoan ? () => onOpenLoan(loan) : undefined,
    onAbono: onAbonoLoan ? () => onAbonoLoan(loan) : undefined,
    onMarkPaid: onMarkPaidLoan ? () => onMarkPaidLoan(loan) : undefined,
    onEdit: onEditLoan ? () => onEditLoan(loan) : undefined,
    onDelete: onDeleteLoan ? () => onDeleteLoan(loan) : undefined,
    onUnmarkPaid: onUnmarkPaidLoan ? () => onUnmarkPaidLoan(loan) : undefined,
  })

  return (
    <div className="overflow-hidden rounded-xl bg-bg-elevated shadow-card">
      {/* Header: tap to expand, plus a direct detail button beside the chevron */}
      <div className={clsx('flex items-center gap-2', compact ? 'px-3 py-2.5' : 'px-3.5 py-3')}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-transform active:scale-[0.99]"
        >
          <Avatar
            name={entry.name}
            avatarUrl={entry.avatarUrl}
            imageUrl={entry.imageUrl}
            isGroup={entry.kind === 'group'}
            size={compact ? 36 : 40}
          />
          <div className="min-w-0 flex-1">
            <p className={clsx('truncate font-extrabold text-text', compact ? 'text-[13.5px]' : 'text-[14px]')}>
              {entry.name}
            </p>
            <p className={clsx('font-mono font-bold tabular-nums', compact ? 'text-[12px]' : 'text-[12.5px]', color)}>
              {netLabel(entry)}
            </p>
          </div>
          {expanded ? (
            <IconChevronDown size={17} className="shrink-0 text-text-tertiary" />
          ) : (
            <IconChevronRight size={17} className="shrink-0 text-text-tertiary" />
          )}
        </button>

        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Ver detalle de ${entry.name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-text-secondary transition-all hover:bg-primary/10 hover:text-primary-deep active:scale-95"
          >
            <IconListDetails size={16} />
          </button>
        )}
      </div>

      {expanded && (
        <div
          className={clsx(
            'animate-[fade-in_200ms_ease-out] border-t border-border pb-3 pt-2.5',
            compact ? 'px-3' : 'px-3.5',
          )}
        >
          {/* Per-member positions (3+ groups) */}
          {entry.kind === 'group' && entry.memberBalances && entry.memberBalances.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1.5">
              {entry.memberBalances.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">{m.name}</span>
                  <span className={clsx('shrink-0 font-mono text-[11.5px] font-bold', netColor(m.net))}>
                    {memberLabel(m.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Pairwise transfers ("A debe X a B") */}
          {entry.edges && entry.edges.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1 rounded-lg bg-bg-secondary/50 px-3 py-2">
              {entry.edges.map((e, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                  <span className="font-semibold text-text">{resolveName(e.fromMemberId)}</span>
                  <IconArrowRight size={12} className="text-text-tertiary" />
                  <span className="font-semibold text-text">{resolveName(e.toMemberId)}</span>
                  <span className="ml-auto font-mono font-bold text-text">{formatMXN(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* What the balance is actually made of: open loans first, then the
              shared movements. A connected contact's loans get synced into the
              group, so movements are often the ONLY thing behind the number. */}
          {hasActive ? (
            <div className="mb-2 flex flex-col gap-1.5">
              {visibleLoans.map((l) => (
                <LoanRow key={l.id} {...loanRowProps(l)} />
              ))}

              {visibleMovements.map((mv) => (
                <SplitMovementRow key={`${mv.kind}:${mv.id}`} mv={mv} />
              ))}

              {hiddenActive > 0 && !showAllActive && (
                <button
                  type="button"
                  onClick={() => setShowAllActive(true)}
                  className="self-start text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
                >
                  Ver {hiddenActive} más
                </button>
              )}
            </div>
          ) : (
            <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-[11.5px] text-text-tertiary">
              Sin movimientos activos
            </p>
          )}

          {/* History only — settled loans are not what the user came for. */}
          {entry.paidLoans.length > 0 && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowPaid((v) => !v)}
                className="text-[10.5px] font-semibold text-text-tertiary underline decoration-dotted underline-offset-2 transition-colors hover:text-text-secondary"
              >
                {showPaid
                  ? 'Ocultar historial'
                  : `Historial · ${entry.paidLoans.length} saldado${entry.paidLoans.length === 1 ? '' : 's'}`}
              </button>
              {showPaid && (
                <div className="mt-1.5 flex flex-col gap-1.5 animate-[fade-in_200ms_ease-out]">
                  {entry.paidLoans.map((l) => (
                    <LoanRow key={l.id} {...loanRowProps(l)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Relationship-level actions */}
          <div className="flex gap-2">
            {onSettle && Math.abs(entry.net) > 0.005 && (
              <button
                type="button"
                onClick={onSettle}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-asset/10 py-2 text-[12px] font-bold text-asset-deep transition-transform hover:bg-asset/20 active:scale-[0.97]"
              >
                <IconCheck size={13} /> Saldar todo
              </button>
            )}
            {onOpen && (
              <button
                type="button"
                onClick={onOpen}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-secondary py-2 text-[12px] font-bold text-text-secondary transition-transform hover:bg-border active:scale-[0.97]"
              >
                Ver detalle
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
