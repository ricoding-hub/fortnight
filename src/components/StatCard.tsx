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
  /** Compact mode: smaller fonts and padding for 3-col grids. */
  compact?: boolean
}

const toneStyles: Record<string, { value: string; icon: string; topBar: string; bg: string }> = {
  asset: {
    value: 'text-asset-deep',
    icon: 'bg-asset-soft text-asset-deep',
    topBar: 'bg-asset',
    bg: 'bg-asset-soft/20',
  },
  debt: {
    value: 'text-debt-deep',
    icon: 'bg-debt-soft text-debt-deep',
    topBar: 'bg-debt',
    bg: 'bg-debt-soft/20',
  },
  primary: {
    value: 'text-primary-deep',
    icon: 'bg-primary-soft text-primary-deep',
    topBar: 'bg-primary',
    bg: 'bg-primary-soft/15',
  },
  accent: {
    value: 'text-lavender-deep',
    icon: 'bg-lavender-soft text-lavender-deep',
    topBar: 'bg-lavender',
    bg: 'bg-lavender-soft/15',
  },
}

const neutralStyle = {
  value: 'text-text',
  icon: 'bg-bg-secondary text-text-secondary',
  topBar: 'bg-border-strong',
  bg: '',
}

/** Compact labelled figure used in the Resumen and Proyección stat grids. */
export function StatCard({ label, value, tone, icon: IconComponent, trend, compact }: StatCardProps) {
  const styles = tone ? toneStyles[tone] : neutralStyle

  return (
    <Card
      variant="stat"
      glow={tone === 'asset' ? 'asset' : tone === 'debt' ? 'debt' : tone === 'primary' ? 'primary' : undefined}
      className={clsx('relative overflow-hidden', compact ? 'p-2.5' : 'p-3.5', styles.bg)}
    >
      <div className={clsx('absolute inset-x-0 top-0 h-[3px] rounded-t-xl', styles.topBar)} />
      <div className={clsx('flex items-start', compact ? 'gap-2' : 'gap-3')}>
        {IconComponent && (
          <div
            className={clsx(
              'flex shrink-0 items-center justify-center rounded-xl',
              compact ? 'h-7 w-7' : 'h-9 w-9',
              styles.icon,
            )}
          >
            <IconComponent size={compact ? 14 : 18} stroke={1.75} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={clsx('font-medium text-text-secondary', compact ? 'text-[10px]' : 'text-[11px]')}>{label}</p>
          <p
            className={clsx(
              'mt-0.5 tabular-nums leading-tight',
              compact ? 'text-sm font-bold' : 'text-lg font-semibold',
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
