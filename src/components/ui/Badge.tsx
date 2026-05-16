import clsx from 'clsx'

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-bg-secondary text-text-secondary',
  success: 'bg-asset-soft text-asset-deep',
  warning: 'bg-peach-soft text-peach-deep',
  danger: 'bg-debt-soft text-debt-deep',
  info: 'bg-primary-soft text-primary-deep',
  accent: 'bg-lavender-soft text-lavender-deep',
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
