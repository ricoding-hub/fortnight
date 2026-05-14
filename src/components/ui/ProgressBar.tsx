import clsx from 'clsx'

interface ProgressBarProps {
  /** 0–100 */
  value: number
  /** Color scheme for the fill. */
  color?: 'primary' | 'asset' | 'debt' | 'warning' | 'accent'
  /** Show percentage label. */
  showLabel?: boolean
  /** Optional text label above the bar. */
  label?: string
  /** Height class override. */
  size?: 'sm' | 'md'
}

const fillColor: Record<string, string> = {
  primary: 'bg-primary',
  asset: 'bg-asset',
  debt: 'bg-debt',
  warning: 'bg-warning',
  accent: 'bg-accent',
}

export function ProgressBar({
  value,
  color = 'primary',
  showLabel = false,
  label,
  size = 'sm',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className="flex flex-col gap-1">
      {(label || showLabel) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-text-secondary">{label}</span>}
          {showLabel && (
            <span className="font-medium tabular-nums text-text">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div
        className={clsx(
          'w-full overflow-hidden rounded-full bg-bg-secondary',
          size === 'sm' ? 'h-2' : 'h-3',
        )}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-700 ease-out animate-[progress-fill_800ms_ease-out]',
            fillColor[color],
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
