import { createElement } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  IconAdjustmentsHorizontal,
  IconArrowsLeftRight,
  IconBuildingBank,
  IconCalendar,
  IconCategory,
  IconHash,
  IconNote,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { categoryIcon, categoryColor } from '@/lib/categories'
import { formatMXN } from '@/lib/format'
import type { Account, Category, Transaction } from '@/types'

interface TransactionDetailModalProps {
  transaction: Transaction
  account?: Account
  category?: Category
  onClose: () => void
  onDelete: (id: string) => Promise<void>
}

const TYPE_LABEL: Record<Transaction['type'], string> = {
  transaction: 'Movimiento',
  adjustment: 'Ajuste de saldo',
  sync: 'Sincronización',
}

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  manual: 'Manual',
  syncfy: 'Sincronizado del banco',
}

interface DetailRowProps {
  icon: typeof IconHash
  label: string
  value: string | null | undefined
  mono?: boolean
}

function DetailRow({ icon, label, value, mono }: DetailRowProps) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-text-secondary">
        {createElement(icon, { size: 14, stroke: 1.75 })}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-text-tertiary">
          {label}
        </p>
        <p className={clsx('mt-0.5 break-words text-[13.5px] text-text', mono && 'font-mono text-[12px]')}>
          {value}
        </p>
      </div>
    </div>
  )
}

export function TransactionDetailModal({
  transaction,
  account,
  category,
  onClose,
  onDelete,
}: TransactionDetailModalProps) {
  const toast = useToast()
  const isAdjustment = transaction.type === 'adjustment'

  // Same net-worth sign convention used by TransactionRow so the detail
  // matches what the user tapped on.
  const netEffect =
    account?.type === 'credit' ? -transaction.amount : transaction.amount
  const positive = netEffect >= 0

  const chipColor = isAdjustment ? '#6B7194' : categoryColor(category)
  const heading = isAdjustment
    ? 'Ajuste de saldo'
    : (category?.name ?? 'Sin categoría')

  async function handleDelete() {
    if (!window.confirm('¿Eliminar este movimiento?')) return
    try {
      await onDelete(transaction.id)
      toast.success('Movimiento eliminado', 'El registro ha sido borrado')
      onClose()
    } catch {
      toast.error('Error', 'No se pudo eliminar el movimiento')
    }
  }

  const created = parseISO(transaction.created_at)

  return (
    <Modal open title="Detalle del movimiento" onClose={onClose}>
      <div className="flex flex-col">
        {/* Hero amount */}
        <div className="flex flex-col items-center gap-2 pb-4 pt-1">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${chipColor}1A`, color: chipColor }}
          >
            {createElement(
              isAdjustment ? IconAdjustmentsHorizontal : categoryIcon(category),
              { size: 26, stroke: 1.75 },
            )}
          </div>
          <p className="text-[12px] font-medium text-text-secondary">{heading}</p>
          <p
            className={clsx(
              'text-3xl font-extrabold tabular-nums',
              positive ? 'text-asset' : 'text-debt',
            )}
          >
            {positive ? '+' : ''}
            {formatMXN(netEffect)}
          </p>
        </div>

        {/* Detail rows */}
        <div className="divide-y divide-border rounded-2xl bg-bg-secondary/40 px-3">
          <DetailRow
            icon={IconCalendar}
            label="Fecha"
            value={format(parseISO(transaction.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          />
          <DetailRow
            icon={IconWallet}
            label="Cuenta"
            value={account?.name ?? 'Cuenta eliminada'}
          />
          <DetailRow
            icon={IconCategory}
            label="Categoría"
            value={isAdjustment ? 'Ajuste (sin categoría)' : category?.name ?? 'Sin categoría'}
          />
          <DetailRow
            icon={IconNote}
            label="Descripción"
            value={transaction.description ?? null}
          />
          <DetailRow
            icon={IconArrowsLeftRight}
            label="Tipo"
            value={TYPE_LABEL[transaction.type]}
          />
          <DetailRow
            icon={IconBuildingBank}
            label="Origen"
            value={SOURCE_LABEL[transaction.source]}
          />
          <DetailRow
            icon={IconHash}
            label="Monto bruto"
            value={`${transaction.amount >= 0 ? '+' : ''}${formatMXN(transaction.amount)} en la cuenta`}
          />
          <DetailRow
            icon={IconCalendar}
            label="Registrado"
            value={format(created, "d 'de' MMM yyyy, HH:mm", { locale: es })}
          />
          {transaction.external_id && (
            <DetailRow
              icon={IconHash}
              label="ID externo"
              value={transaction.external_id}
              mono
            />
          )}
        </div>

        {transaction.source !== 'syncfy' && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-debt/20 bg-debt/5 py-2.5 text-sm font-semibold text-debt transition-colors hover:bg-debt/10"
          >
            <IconTrash size={16} /> Eliminar movimiento
          </button>
        )}
        {transaction.source === 'syncfy' && (
          <p className="mt-4 text-center text-[11px] text-text-tertiary">
            Los movimientos sincronizados se gestionan desde tu banco.
          </p>
        )}
      </div>
    </Modal>
  )
}
