import { daysUntilDayOfMonth, daysUntilPayment } from '@/lib/dates'
import { Badge } from '@/components/ui/Badge'
import type { Account } from '@/types'

interface CreditCycleBadgeProps {
  account: Account
}

export function CreditCycleBadge({ account }: CreditCycleBadgeProps) {
  if (account.cut_day == null && account.payment_due_day == null && account.payment_grace_days == null) {
    return null
  }

  const paymentDays = daysUntilPayment(account)

  let variant: 'neutral' | 'warning' | 'danger' = 'neutral'
  if (paymentDays != null) {
    if (paymentDays <= 0) variant = 'danger'
    else if (paymentDays <= 3) variant = 'danger'
    else if (paymentDays <= 5) variant = 'warning'
  }

  return (
    <div className="mt-0.5 flex flex-wrap gap-1.5">
      {paymentDays != null && (
        <Badge variant={variant}>
          {paymentDays <= 0 ? 'Pagar hoy' : `Pago en ${paymentDays}d`}
        </Badge>
      )}
      {account.cut_day != null && (
        <Badge variant="neutral" className="opacity-60 text-[10px]">
          Corte {daysUntilDayOfMonth(account.cut_day)}d
        </Badge>
      )}
    </div>
  )
}
