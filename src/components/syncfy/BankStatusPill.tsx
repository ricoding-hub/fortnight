import { Badge } from '@/components/ui/Badge'
import type { SyncfyStatus } from '@/types'

interface BankStatusPillProps {
  status: SyncfyStatus
}

const STATUS_LABEL: Record<SyncfyStatus, string> = {
  active: 'Sincronizado',
  token_expired: 'Reconectar',
  login_required: 'Reconectar',
  payment_required: 'Plan vencido',
  disabled: 'Desconectado',
  error: 'Error',
}

const STATUS_VARIANT: Record<SyncfyStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  token_expired: 'warning',
  login_required: 'warning',
  payment_required: 'warning',
  disabled: 'neutral',
  error: 'danger',
}

export function BankStatusPill({ status }: BankStatusPillProps) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}
