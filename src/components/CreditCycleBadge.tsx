import { daysUntilDayOfMonth } from '@/lib/dates'
import { Badge } from '@/components/ui/Badge'

interface CreditCycleBadgeProps {
  cutDay: number | null
  paymentDueDay: number | null
}

export function CreditCycleBadge({
  cutDay,
  paymentDueDay,
}: CreditCycleBadgeProps) {
  // Nothing to show
  if (cutDay == null && paymentDueDay == null) return null

  const paymentDays = paymentDueDay != null ? daysUntilDayOfMonth(paymentDueDay) : null

  // Payment urgency drives the badge variant
  let variant: 'neutral' | 'warning' | 'danger' = 'neutral'
  if (paymentDays != null) {
    if (paymentDays <= 3) variant = 'danger'
    else if (paymentDays <= 5) variant = 'warning'
  }

  return (
    <div className="mt-0.5 flex flex-wrap gap-1.5">
      {/* Payment first — primary info */}
      {paymentDays != null && (
        <Badge variant={variant}>
          Pago en {paymentDays}d
        </Badge>
      )}
      {/* Cut day — secondary, always neutral */}
      {cutDay != null && (
        <Badge variant="neutral" className="opacity-60 text-[10px]">
          Corte {daysUntilDayOfMonth(cutDay)}d
        </Badge>
      )}
    </div>
  )
}
