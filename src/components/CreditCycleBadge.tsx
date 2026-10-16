import { daysUntilDayOfMonth, daysUntilPayment } from '@/lib/dates'
import { fromKey, toKey } from '@/lib/localDate'
import { Badge } from '@/components/ui/Badge'
import type { EstadosTarjeta } from '@/lib/estadoDeCuenta'
import type { Account } from '@/types'

interface CreditCycleBadgeProps {
  account: Account
  /** Con el estado de cuenta, el aviso de pago sabe si ya pagaste. */
  estado?: EstadosTarjeta
}

export function CreditCycleBadge({ account, estado }: CreditCycleBadgeProps) {
  if (account.cut_day == null && account.payment_due_day == null && account.payment_grace_days == null) {
    return null
  }

  const conEstado = estado && !estado.sinCorte
  const p = estado?.proximo ?? null
  // Días hasta la fecha límite del estado que toca, o —sin estado— la de calendario.
  const paymentDays = conEstado
    ? p
      ? Math.round((fromKey(p.vence).getTime() - fromKey(toKey(new Date())).getTime()) / 86_400_000)
      : null
    : daysUntilPayment(account)

  let variant: 'neutral' | 'warning' | 'danger' = 'neutral'
  if (paymentDays != null) {
    if (paymentDays <= 3) variant = 'danger'
    else if (paymentDays <= 5) variant = 'warning'
  }

  return (
    <div className="mt-0.5 flex flex-wrap gap-1.5">
      {conEstado && !p ? (
        <Badge variant="success">Al corriente</Badge>
      ) : (
        paymentDays != null && (
          <Badge variant={variant}>
            {paymentDays < 0 ? 'Venció' : paymentDays === 0 ? 'Pagar hoy' : `Pago en ${paymentDays}d`}
          </Badge>
        )
      )}
      {account.cut_day != null && (
        <Badge variant="neutral" className="text-[10px]">
          Corte {daysUntilDayOfMonth(account.cut_day)}d
        </Badge>
      )}
    </div>
  )
}
