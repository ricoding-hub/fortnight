import { createElement } from 'react'
import { IconPencil, IconTrash, IconReceipt } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { categoryIcon, categoryColor } from '@/lib/categories'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import type { Category, SplitExpense, SplitExpenseShare, SplitMember } from '@/types'

interface ExpenseDetailModalProps {
  open: boolean
  onClose: () => void
  expense: SplitExpense | null
  /** Per-member shares of this expense. */
  shares: SplitExpenseShare[]
  /** Active + past members, names already resolved for display. */
  members: SplitMember[]
  /** Resolved category (or null when uncategorized). */
  category: Category | null
  onEdit: () => void
  onDelete: () => void
}

/**
 * Read-only detail of a shared expense: amount, category, who paid, date, and
 * the per-member breakdown. Edit/Delete hand off to the existing flows.
 */
export function ExpenseDetailModal({
  open,
  onClose,
  expense,
  shares,
  members,
  category,
  onEdit,
  onDelete,
}: ExpenseDetailModalProps) {
  if (!expense) return null
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '—'
  const payer = nameOf(expense.paid_by_member_id)
  const catColor = categoryColor(category)

  return (
    <Modal open={open} onClose={onClose} title="Detalle del gasto">
      <div className="flex flex-col gap-4">
        {/* Amount + description hero */}
        <div className="flex items-center gap-3 rounded-xl bg-bg-secondary/50 px-4 py-3.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: catColor }}
          >
            {category ? createElement(categoryIcon(category), { size: 22, stroke: 2 }) : <IconReceipt size={22} stroke={2} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-text">{expense.description}</p>
            <p className="text-[11.5px] font-semibold text-text-tertiary">
              {category ? category.name : 'Sin categoría'} · {formatDateGroupMX(expense.expense_date)}
            </p>
          </div>
          <span className="shrink-0 font-mono text-[17px] font-extrabold text-text">
            {formatMXN(Number(expense.amount))}
          </span>
        </div>

        {/* Paid by */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[12.5px] font-semibold text-text-secondary">Pagó</span>
          <span className="text-[13px] font-bold text-text">{payer}</span>
        </div>

        {/* Per-member breakdown */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Reparto
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">
                  {nameOf(s.member_id)}
                </span>
                <span className="shrink-0 font-mono text-[13px] font-bold text-text-secondary">
                  {formatMXN(Number(s.amount))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onEdit} className="flex-1">
            <IconPencil size={15} /> Editar
          </Button>
          <Button variant="danger" onClick={onDelete} className="flex-1">
            <IconTrash size={15} /> Eliminar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
