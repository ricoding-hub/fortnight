import { IconCalendarEvent, IconCheck } from '@tabler/icons-react'
import { Card } from '@/components/ui/Card'
import { formatMXN } from '@/lib/format'
import type { Installment } from '@/types'

interface InstallmentCardProps {
  installment: Installment
  onMarkPaid?: () => void
  onDelete?: () => void
}

export function InstallmentCard({ installment: inst, onMarkPaid, onDelete }: InstallmentCardProps) {
  const remaining = inst.months_total - inst.months_paid
  const progress = inst.months_total > 0 ? inst.months_paid / inst.months_total : 0
  const isDone = inst.status === 'paid'

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: isDone ? 'var(--color-asset-soft)' : 'var(--color-primary-soft)' }}
        >
          <IconCalendarEvent
            size={18}
            stroke={1.75}
            color={isDone ? 'var(--color-asset-deep)' : 'var(--color-primary-deep)'}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-bold text-text">{inst.name}</p>
            {isDone ? (
              <span className="shrink-0 rounded-full bg-asset-soft px-2 py-0.5 text-[10px] font-extrabold text-asset-deep">
                Completado
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary-deep">
                {remaining} mes{remaining === 1 ? '' : 'es'} restante{remaining === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[12px] font-semibold text-text-secondary">
            {formatMXN(inst.monthly_amount)}/mes
            <span className="ml-1.5 text-text-tertiary">· total {formatMXN(inst.total_amount)}</span>
          </p>

          {/* Progress bar */}
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-text-tertiary">
                {inst.months_paid}/{inst.months_total} meses
              </span>
              <span className="text-[10px] font-bold text-primary-deep">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress * 100}%`,
                  background: isDone
                    ? 'linear-gradient(90deg, #2BB673, #5DD296)'
                    : 'linear-gradient(90deg, #6366F1, #9B7BFF)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {!isDone && onMarkPaid && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={onMarkPaid}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-soft py-1.5 text-[12px] font-bold text-primary-deep transition-colors active:bg-primary-soft/60"
          >
            <IconCheck size={13} stroke={2.5} />
            Marcar mes pagado
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-text-tertiary transition-colors hover:text-debt active:scale-95"
            >
              Eliminar
            </button>
          )}
        </div>
      )}
      {isDone && onDelete && (
        <div className="mt-2 flex justify-end border-t border-border pt-2">
          <button
            type="button"
            onClick={onDelete}
            className="text-[11.5px] font-bold text-text-tertiary hover:text-debt"
          >
            Eliminar
          </button>
        </div>
      )}
    </Card>
  )
}
