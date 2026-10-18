import { createElement, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  IconAdjustmentsHorizontal,
  IconArrowsLeftRight,
  IconBuildingBank,
  IconCalendar,
  IconCalendarEvent,
  IconCategory,
  IconCreditCardPay,
  IconHash,
  IconNote,
  IconPencil,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/hooks/useToast'
import { categoryIcon, categoryColor } from '@/lib/categories'
import { formatMXN } from '@/lib/format'
import { clasificar, efectoEnPatrimonio, ETIQUETA_CLASE } from '@/lib/movimiento'
import { useUiStore } from '@/store/uiStore'
import type { Account, Category, Transaction } from '@/types'

interface TransactionDetailModalProps {
  transaction: Transaction
  account?: Account
  category?: Category
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  /** Abrir la edición. Ausente para el cargo de un MSI (se edita desde su plan). */
  onEdit?: () => void
}

const TYPE_LABEL: Record<Transaction['type'], string> = {
  transaction: 'Movimiento',
  adjustment: 'Ajuste de saldo',
  sync: 'Sincronización',
  installment: 'Compra a meses',
  transfer: 'Pago de tarjeta',
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
  onEdit,
}: TransactionDetailModalProps) {
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmar, setConfirmar] = useState(false)
  const isAdjustment = transaction.type === 'adjustment'
  const esCargoMsi = transaction.type === 'installment' && !!transaction.installment_id
  const clase = clasificar(transaction, account, category)
  const esPago = clase === 'pago-tarjeta' || clase === 'transferencia'
  const abrirAMeses = useUiStore((s) => s.abrirAMeses)
  // Una compra con tarjeta registrada como gasto normal se puede volver MSI:
  // así el estado de cuenta deja de pedirla completa («1 solo pago»).
  const convertible =
    clase === 'gasto' &&
    account?.type === 'credit' &&
    !transaction.installment_id &&
    (transaction.type === 'transaction' || transaction.type === 'sync') &&
    Number(transaction.amount) > 0

  // Same net-worth sign convention used by TransactionRow so the detail
  // matches what the user tapped on.
  const netEffect = efectoEnPatrimonio(transaction, account)
  const positive = netEffect >= 0

  const chipColor = isAdjustment || esPago ? '#6B7194' : categoryColor(category)
  const heading = isAdjustment
    ? 'Ajuste de saldo'
    : esPago
      ? 'Pago de tarjeta'
      : clase === 'reembolso'
        ? `Reembolso · ${category?.name ?? 'sin categoría'}`
        : (category?.name ?? 'Sin categoría')

  // Lo que pasa al borrarlo, dicho antes: el trigger revierte el saldo.
  const consecuencia = transaction.transfer_id
    ? 'Se borra el pago completo: la tarjeta vuelve a deber ese monto y la cuenta de la que salió lo recupera.'
    : account
      ? `El saldo de ${account.name} ${
          transaction.amount > 0 ? 'baja' : 'sube'
        } ${formatMXN(Math.abs(transaction.amount))}${esCargoMsi ? ' y el plan a meses se queda sin cargo' : ''}.`
      : 'Se borra del historial.'

  async function handleDelete() {
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
              isAdjustment ? IconAdjustmentsHorizontal : esPago ? IconCreditCardPay : categoryIcon(category),
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
            value={isAdjustment ? 'Ajuste (sin categoría)' : esPago ? null : category?.name ?? 'Sin categoría'}
          />
          <DetailRow
            icon={IconNote}
            label="Descripción"
            value={transaction.description ?? null}
          />
          <DetailRow
            icon={IconArrowsLeftRight}
            label="Tipo"
            value={ETIQUETA_CLASE[clase] ?? TYPE_LABEL[transaction.type]}
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

        {esCargoMsi && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-primary-soft/40 px-3.5 py-3">
            <IconCalendarEvent size={16} className="mt-0.5 shrink-0 text-primary-deep" />
            <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-text">
              Es la compra de un plan a meses. Las mensualidades, el plazo y este cargo se cambian desde el
              plan.
              <button
                type="button"
                onClick={() => {
                  onClose()
                  void navigate(`/cuentas/mis?msi=${transaction.installment_id}`)
                }}
                className="mt-1.5 block min-h-[36px] font-bold text-primary-deep"
              >
                Ver plan
              </button>
            </div>
          </div>
        )}

        {convertible && (
          <button
            type="button"
            onClick={() => {
              onClose()
              abrirAMeses({
                txId: transaction.id,
                name: transaction.description?.trim() || category?.name || 'Compra a meses',
                total: Number(transaction.amount),
                date: transaction.date.slice(0, 10),
                accountId: transaction.account_id,
              })
            }}
            className="mt-4 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary-soft/40 text-sm font-semibold text-primary-deep transition-colors hover:bg-primary-soft/70"
          >
            <IconCalendarEvent size={16} /> Fue a meses: convertir
          </button>
        )}

        {onEdit && !esCargoMsi && (
          <button
            type="button"
            onClick={onEdit}
            className="mt-4 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border bg-bg-elevated text-sm font-semibold text-text transition-colors hover:bg-bg-secondary"
          >
            <IconPencil size={16} /> Editar movimiento
          </button>
        )}

        {transaction.source !== 'syncfy' && (
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            className="mt-2 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-debt/20 bg-debt/5 text-sm font-semibold text-debt-ink transition-colors hover:bg-debt/10"
          >
            <IconTrash size={16} /> Eliminar movimiento
          </button>
        )}
        {transaction.source === 'syncfy' && (
          <p className="mt-4 text-center text-[11px] text-text-tertiary">
            Los movimientos sincronizados no se borran: vienen de tu banco.
          </p>
        )}
      </div>
      <ConfirmModal
        open={confirmar}
        title="Eliminar movimiento"
        destructive
        confirmLabel="Eliminar"
        message={consecuencia}
        onClose={() => setConfirmar(false)}
        onConfirm={() => void handleDelete()}
      />
    </Modal>
  )
}
