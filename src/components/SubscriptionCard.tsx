import { useState } from 'react'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import { BrandLogo } from '@/components/BrandLogo'
import type { Subscription } from '@/types'

const FREQ_LABEL: Record<string, string> = {
  mensual: 'mensual',
  trimestral: 'trimestral',
  anual: 'anual',
}

interface Props {
  sub: Subscription
  monthlyAmount: number
  onEdit: (sub: Subscription) => void
  onDelete: (id: string) => void
}

export function SubscriptionCard({ sub, monthlyAmount, onEdit, onDelete }: Props) {
  const [confirm, setConfirm] = useState(false)

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg-elevated px-3.5 py-3 shadow-card">
      <BrandLogo brandId={sub.brand_id} name={sub.name} color={sub.color} size={42} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-text">{sub.name}</p>
        <p className="mt-0.5 text-[11px] font-medium text-text-tertiary">
          {fmt(sub.amount)} · {FREQ_LABEL[sub.frequency]} · día {sub.charge_day}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {sub.frequency !== 'mensual' && (
          <span className="mr-1 text-[11px] font-semibold text-text-secondary">
            {fmt(monthlyAmount)}/mes
          </span>
        )}

        {confirm ? (
          <>
            <button
              type="button"
              onClick={() => onDelete(sub.id)}
              className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="rounded-lg bg-bg-secondary px-2 py-1 text-[11px] font-bold text-text-secondary"
            >
              No
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(sub)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-secondary transition-colors hover:bg-primary/10"
            >
              <IconPencil size={14} stroke={2} className="text-text-secondary" />
            </button>
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-secondary transition-colors hover:bg-red-50"
            >
              <IconTrash size={14} stroke={2} className="text-text-secondary hover:text-red-500" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
