import { IconArrowDown, IconArrowUp, IconCheck, IconEdit, IconTrash } from '@tabler/icons-react'
import { Badge } from '@/components/ui/Badge'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import type { SplitExpense, SplitSettlement } from '@/types'

/** A shared-group expense or settlement, shown (and editable) inline on cards. */
export interface SplitMovement {
  kind: 'expense' | 'settlement'
  id: string
  description: string
  payerName: string
  date: string
  /** Contribution to my net: + they owe me, − I owe. */
  myEffect: number
  expense?: SplitExpense
  settlement?: SplitSettlement
}

interface SplitMovementRowProps {
  mv: SplitMovement
  onEditExpense?: (expense: SplitExpense) => void
  onDeleteExpense?: (expense: SplitExpense) => void
  onDeleteSettlement?: (settlement: SplitSettlement) => void
}

/** One shared movement, with full edit/delete parity with the group detail. */
export function SplitMovementRow({
  mv,
  onEditExpense,
  onDeleteExpense,
  onDeleteSettlement,
}: SplitMovementRowProps) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ' +
          (mv.kind === 'settlement'
            ? 'bg-asset/10 text-asset-deep'
            : mv.myEffect >= 0
              ? 'bg-primary/10 text-primary-deep'
              : 'bg-debt/10 text-debt-deep')
        }
      >
        {mv.kind === 'settlement' ? (
          <IconCheck size={12} stroke={2.5} />
        ) : mv.myEffect >= 0 ? (
          <IconArrowDown size={12} stroke={2.5} />
        ) : (
          <IconArrowUp size={12} stroke={2.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {mv.kind === 'settlement' ? (
            <Badge variant="success">Liquidación</Badge>
          ) : (
            <Badge variant={mv.myEffect >= 0 ? 'info' : 'danger'}>
              {mv.myEffect >= 0 ? 'Te deben' : 'Debes'}
            </Badge>
          )}
          <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] font-bold text-text-secondary">
            Compartido
          </span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">
          {mv.description}
          {mv.kind === 'expense' && mv.payerName && ` · Pagó ${mv.payerName}`}
        </p>
        <p className="mt-0.5 text-sm font-bold tabular-nums text-text">
          {formatMXN(Math.abs(mv.myEffect))}
        </p>
        <p className="mt-0.5 text-[10px] text-text-tertiary">{formatDateGroupMX(mv.date)}</p>
      </div>
      <div className="flex items-center gap-1">
        {mv.kind === 'expense' && mv.expense && onEditExpense && (
          <button
            type="button"
            onClick={() => onEditExpense(mv.expense!)}
            aria-label="Editar gasto"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
          >
            <IconEdit size={15} />
          </button>
        )}
        {mv.kind === 'expense' && mv.expense && onDeleteExpense && (
          <button
            type="button"
            onClick={() => onDeleteExpense(mv.expense!)}
            aria-label="Eliminar gasto"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
          >
            <IconTrash size={15} />
          </button>
        )}
        {mv.kind === 'settlement' && mv.settlement && onDeleteSettlement && (
          <button
            type="button"
            onClick={() => onDeleteSettlement(mv.settlement!)}
            aria-label="Eliminar liquidación"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
          >
            <IconTrash size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
