import { IconArrowDown, IconArrowUp, IconCheck, IconEdit, IconTrash, IconChevronRight } from '@tabler/icons-react'
import clsx from 'clsx'
import { loanRemaining } from '@/hooks/useLoans'
import { Badge } from '@/components/ui/Badge'
import { loanDateHint } from '@/lib/loanFormat'
import { formatMXN } from '@/lib/format'
import type { Loan, LoanPayment } from '@/types'

interface LoanRowProps {
  loan: Loan
  payments: LoanPayment[]
  /** Dense single-block variant for Home and the group detail (~64px). */
  compact?: boolean
  /** Open the full loan detail. When set the content area becomes tappable. */
  onOpenDetail?: () => void
  onAbono?: () => void
  onMarkPaid?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onUnmarkPaid?: () => void
}

/**
 * One loan, with everything the user needs to recognise it: direction, concept,
 * remaining vs total, progress and date. Which actions show is driven by the
 * loan's own `paid_at` (a settled loan offers "Recuperar", an open one offers
 * abono/saldar) — never by which list it happens to be rendered in, which is
 * how the actions silently disappeared before.
 */
export function LoanRow({
  loan,
  payments,
  compact = false,
  onOpenDetail,
  onAbono,
  onMarkPaid,
  onEdit,
  onDelete,
  onUnmarkPaid,
}: LoanRowProps) {
  const isPaid = loan.paid_at != null
  const total = Number(loan.amount)
  const remaining = loanRemaining(loan, payments)
  const hasPayments = payments.length > 0
  const paidPercent = total > 0 ? Math.round((1 - remaining / total) * 100) : 0
  const dateHint = loanDateHint(loan, payments)
  const showRemaining = !isPaid && hasPayments && remaining < total
  const owedToMe = loan.direction === 'owed_to_me'

  const directionIcon = (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full',
        compact ? 'h-7 w-7' : 'mt-0.5 h-6 w-6',
        owedToMe ? 'bg-primary/10 text-primary-deep' : 'bg-debt/10 text-debt-deep',
      )}
    >
      {owedToMe ? <IconArrowDown size={compact ? 14 : 12} stroke={2.5} /> : <IconArrowUp size={compact ? 14 : 12} stroke={2.5} />}
    </div>
  )

  if (compact) {
    return (
      <div className="rounded-xl bg-bg-secondary/45 px-2.5 py-2">
        <button
          type="button"
          onClick={onOpenDetail}
          disabled={!onOpenDetail}
          className="flex w-full items-center gap-2.5 text-left transition-transform enabled:active:scale-[0.99]"
        >
          {directionIcon}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-text">
              {loan.notes?.trim() || (owedToMe ? 'Te deben' : 'Le debes')}
            </p>
            <p className="truncate text-[10px] text-text-tertiary">{dateHint}</p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={clsx(
                'font-mono text-[12.5px] font-bold tabular-nums',
                isPaid ? 'text-text-tertiary line-through' : 'text-text',
              )}
            >
              {formatMXN(showRemaining ? remaining : total)}
            </p>
            {showRemaining && <p className="text-[9.5px] text-text-tertiary">de {formatMXN(total)}</p>}
          </div>
          {onOpenDetail && <IconChevronRight size={14} className="shrink-0 text-text-tertiary" />}
        </button>

        {!isPaid && hasPayments && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${paidPercent}%` }}
            />
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-1.5 pl-[38px]">
          {!isPaid && onAbono && (
            <button
              type="button"
              onClick={onAbono}
              className="rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary-deep transition-colors hover:bg-primary/20"
            >
              + Abono
            </button>
          )}
          {!isPaid && onMarkPaid && (
            <button
              type="button"
              onClick={onMarkPaid}
              className="flex items-center gap-1 rounded-lg bg-asset/10 px-2 py-1 text-[11px] font-semibold text-asset-deep transition-colors hover:bg-asset/20"
            >
              <IconCheck size={11} /> Saldar
            </button>
          )}
          {isPaid && onUnmarkPaid && (
            <button
              type="button"
              onClick={onUnmarkPaid}
              className="rounded-lg bg-bg-secondary px-2 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:bg-border"
            >
              ↩ Recuperar
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Editar préstamo de ${loan.name}`}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text"
            >
              <IconEdit size={14} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="py-3">
      <button
        type="button"
        onClick={onOpenDetail}
        disabled={!onOpenDetail}
        className="flex w-full items-start gap-3 text-left"
      >
        {directionIcon}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={owedToMe ? 'info' : 'danger'}>{owedToMe ? 'Te deben' : 'Debes'}</Badge>
            {isPaid && <Badge variant="success">Saldado</Badge>}
          </div>
          {loan.notes && (
            <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">{loan.notes}</p>
          )}

          <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
            {showRemaining ? (
              <>
                <span className="text-sm font-bold tabular-nums text-text">{formatMXN(remaining)}</span>
                <span className="text-[11px] text-text-tertiary">restante</span>
                <span className="text-[11px] text-text-tertiary">· de {formatMXN(total)}</span>
              </>
            ) : (
              <span
                className={clsx(
                  'text-sm font-bold tabular-nums',
                  isPaid ? 'text-text-tertiary line-through' : 'text-text',
                )}
              >
                {formatMXN(total)}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-[10px] text-text-tertiary">{dateHint}</p>

          {!isPaid && hasPayments && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
          )}
        </div>

        {onOpenDetail && <IconChevronRight size={15} className="mt-1 shrink-0 text-text-tertiary" />}
      </button>

      <div className="mt-2 flex items-center gap-1.5 pl-9">
        {!isPaid && onAbono && (
          <button
            type="button"
            onClick={onAbono}
            className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-primary-deep transition-colors hover:bg-primary/20"
          >
            + Abono
          </button>
        )}
        {!isPaid && onMarkPaid && (
          <button
            type="button"
            onClick={onMarkPaid}
            className="flex items-center gap-1 rounded-lg bg-asset/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-asset-deep transition-colors hover:bg-asset/20"
          >
            <IconCheck size={12} /> Saldado
          </button>
        )}
        {isPaid && onUnmarkPaid && (
          <button
            type="button"
            onClick={onUnmarkPaid}
            className="rounded-lg bg-bg-secondary px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-border"
          >
            ↩ Recuperar
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Editar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
            >
              <IconEdit size={15} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Eliminar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
            >
              <IconTrash size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
