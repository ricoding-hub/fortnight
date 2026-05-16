import clsx from 'clsx'
import { type Icon } from '@tabler/icons-react'
import { Card } from '@/components/ui/Card'

interface StatCardProps {
  label: string
  value: string
  /** Colors the value and left accent. */
  tone?: 'asset' | 'debt' | 'primary' | 'accent'
  /** Optional icon rendered in a tinted circle. */
  icon?: Icon
  /** Optional trend text shown below the value. */
  trend?: string
}

const toneStyles: Record<string, { value: string; icon: string; accent: string }> = {
  asset: {
    value: 'text-asset-deep',
    icon: 'bg-asset-soft text-asset-deep',
    accent: 'border-l-asset',
  },
  debt: {
    value: 'text-debt-deep',
    icon: 'bg-debt-soft text-debt-deep',
    accent: 'border-l-debt',
  },
  primary: {
    value: 'text-primary-deep',
    icon: 'bg-primary-soft text-primary-deep',
    accent: 'border-l-primary',
  },
  accent: {
    value: 'text-lavender-deep',
    icon: 'bg-lavender-soft text-lavender-deep',
    accent: 'border-l-lavender',
  },
}

const neutralStyle = {
  value: 'text-text',
  icon: 'bg-bg-secondary text-text-secondary',
  accent: 'border-l-border-strong',
}

/** Compact labelled figure used in the Resumen and Proyección stat grids. */
export function StatCard({ label, value, tone, icon: IconComponent, trend }: StatCardProps) {
  const styles = tone ? toneStyles[tone] : neutralStyle

  return (
    <Card
      variant="stat"
      glow={tone === 'asset' ? 'asset' : tone === 'debt' ? 'debt' : tone === 'primary' ? 'primary' : undefined}
      className={clsx('relative border-l-[3px] p-3.5', styles.accent)}
    >
      <div className="flex items-start gap-3">
        {IconComponent && (
          <div
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              styles.icon,
            )}
          >
            <IconComponent size={18} stroke={1.75} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-text-secondary">{label}</p>
          <p
            className={clsx(
              'mt-0.5 text-lg font-semibold tabular-nums leading-tight',
              styles.value,
            )}
          >
            {value}
          </p>
          {trend && (
            <p className="mt-0.5 text-[10px] text-text-tertiary">{trend}</p>
          )}
        </div>
      </div>
    </Card>
  )
}
