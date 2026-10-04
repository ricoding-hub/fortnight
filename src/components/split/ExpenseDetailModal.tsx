import { createElement } from 'react'
import { IconCheck, IconPencil, IconTrash, IconReceipt } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { categoryIcon, categoryColor } from '@/lib/categories'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import { registroDistinto } from '@/lib/movementDates'
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
  /** Nombre de quien agregó el gasto, para «Registrado por…». */
  creador?: string | null
  onEdit: () => void
  onDelete: () => void
  /**
   * Saldar este gasto por separado. null cuando no hay nada que saldar o no hay
   * un único pago que lo cierre (te deben varias personas).
   */
  saldar?: { etiqueta: string; monto: number; onClick: () => void } | null
  /** Ya quedó saldado con una liquidación enlazada. */
  saldado?: boolean
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
  creador = null,
  onEdit,
  onDelete,
  saldar = null,
  saldado = false,
}: ExpenseDetailModalProps) {
  if (!expense) return null
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '—'
  const payer = nameOf(expense.paid_by_member_id)
  const catColor = categoryColor(category)
  const registrado = registroDistinto(expense.expense_date, expense.created_at)

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
            <p className="text-[11.5px] font-semibold text-text-secondary">
              {category ? category.name : 'Sin categoría'}
            </p>
          </div>
          <span className="shrink-0 font-mono text-[17px] font-extrabold text-text">
            {formatMXN(Number(expense.amount))}
          </span>
        </div>

        {/* Quién y cuándo. Dos fechas distintas: la del gasto y la del registro. */}
        <dl className="divide-y divide-border rounded-xl bg-bg-secondary/40 px-3.5">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-[12.5px] font-semibold text-text-secondary">Pagó</dt>
            <dd className="text-[13px] font-bold text-text">{payer}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-[12.5px] font-semibold text-text-secondary">Fecha del gasto</dt>
            <dd className="text-[13px] font-bold text-text">{formatDateGroupMX(expense.expense_date)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-[12.5px] font-semibold text-text-secondary">Registrado</dt>
            <dd className="min-w-0 truncate text-right text-[13px] font-bold text-text">
              {format(parseISO(expense.created_at), "d MMM, h:mm a", { locale: es })}
              {creador ? ` · ${creador}` : ''}
              {registrado && (
                <span className="ml-1.5 rounded-full bg-peach-soft px-1.5 py-px text-[10px] font-extrabold text-peach-ink">
                  otro día
                </span>
              )}
            </dd>
          </div>
        </dl>

        {/* Per-member breakdown */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
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

        {/* Saldar sólo este gasto. Es la acción que más se busca al abrir un
            gasto, por eso va antes que editar o borrar. */}
        {saldar && (
          <Button onClick={saldar.onClick} className="w-full">
            <IconCheck size={15} stroke={2.5} /> {saldar.etiqueta} · {formatMXN(saldar.monto)}
          </Button>
        )}
        {saldado && (
          <p className="flex items-center justify-center gap-1.5 rounded-xl bg-asset-soft/60 py-2.5 text-[12.5px] font-bold text-asset-deep">
            <IconCheck size={15} stroke={2.5} /> Este gasto ya está saldado
          </p>
        )}

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
