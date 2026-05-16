import { createElement, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconAdjustmentsHorizontal, IconTrash } from '@tabler/icons-react'
import { useToast } from '@/hooks/useToast'
import { categoryIcon, categoryColor } from '@/lib/categories'
import { formatMXN } from '@/lib/format'
import type { Account, Category, Transaction } from '@/types'

interface TransactionRowProps {
  transaction: Transaction
  account?: Account
  category?: Category
  onDelete: (id: string) => Promise<void>
}

const REVEAL = 80 // px of delete action exposed when the row is swiped open
const SNAP = 40 // drag past this and the row stays open

export function TransactionRow({
  transaction,
  account,
  category,
  onDelete,
}: TransactionRowProps) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const baseOffset = useRef(0)
  const moved = useRef(false)

  const isAdjustment = transaction.type === 'adjustment'

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    baseOffset.current = offset
    moved.current = false
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - startX.current
    if (Math.abs(dx) > 4) moved.current = true
    setOffset(Math.max(-REVEAL, Math.min(0, baseOffset.current + dx)))
  }

  function onPointerEnd() {
    if (!dragging) return
    setDragging(false)
    setOffset((current) => (current <= -SNAP ? -REVEAL : 0))
  }

  const toast = useToast()

  async function handleDelete() {
    if (!window.confirm('¿Eliminar este movimiento?')) {
      setOffset(0)
      return
    }
    try {
      await onDelete(transaction.id)
      toast.success('Movimiento eliminado', 'El registro ha sido borrado')
    } catch {
      setOffset(0)
      toast.error('Error', 'No se pudo eliminar el movimiento')
    }
  }

  // Sign and color follow the net-worth impact: a credit-card purchase raises
  // the account balance but lowers net worth, so it reads as negative here.
  const netEffect =
    account?.type === 'credit' ? -transaction.amount : transaction.amount
  const positive = netEffect >= 0

  const chipColor = isAdjustment ? '#6B7194' : categoryColor(category)

  const title = isAdjustment
    ? 'Ajuste de saldo'
    : (category?.name ?? 'Sin categoría')
  const subtitleParts = [account?.name ?? 'Cuenta eliminada']
  if (transaction.description) subtitleParts.push(transaction.description)

  return (
    <div className="relative overflow-hidden border-b border-border">
      {/* Delete action behind */}
      <button
        type="button"
        onClick={() => void handleDelete()}
        aria-label="Eliminar movimiento"
        className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-debt text-white transition-colors hover:bg-debt-deep"
      >
        <IconTrash size={20} />
      </button>

      {/* Swipeable row */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={() => {
          if (!moved.current && offset !== 0) setOffset(0)
        }}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        className={clsx(
          'relative flex items-center gap-3 bg-bg-elevated px-4 py-3',
          !dragging && 'transition-transform duration-[--duration-normal]',
        )}
      >
        {/* Category icon chip — dynamic dispatch via createElement keeps the
            React Compiler happy about "no components created during render". */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${chipColor}18`, color: chipColor }}
        >
          {createElement(
            isAdjustment ? IconAdjustmentsHorizontal : categoryIcon(category),
            { size: 18, stroke: 1.75 },
          )}
        </div>

        {/* Title + subtitle */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{title}</p>
          <p className="truncate text-xs text-text-secondary">
            {subtitleParts.join(' · ')}
          </p>
        </div>

        {/* Amount */}
        <span
          className={clsx(
            'shrink-0 text-sm font-bold tabular-nums',
            positive ? 'text-asset' : 'text-debt',
          )}
        >
          {positive ? '+' : ''}
          {formatMXN(netEffect)}
        </span>
      </div>
    </div>
  )
}
