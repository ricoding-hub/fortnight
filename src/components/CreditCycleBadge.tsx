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
  if (cutDay == null && paymentDueDay == null) return null

  const parts: string[] = []
  let variant: 'neutral' | 'warning' | 'danger' = 'neutral'

  if (cutDay != null) {
    const days = daysUntilDayOfMonth(cutDay)
    parts.push(`Corte: ${days}d`)
  }

  if (paymentDueDay != null) {
    const days = daysUntilDayOfMonth(paymentDueDay)
    parts.push(`Pago: ${days}d`)
    if (days <= 3) variant = 'danger'
    else if (days <= 5) variant = 'warning'
  }

  return (
    <Badge variant={variant} className="mt-0.5">
      {parts.join(' · ')}
    </Badge>
  )
}
