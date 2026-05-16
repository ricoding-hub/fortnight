import { type ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  /** Smaller size for inline/compact use. */
  compact?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary text-text-inverse shadow-card hover:bg-primary-deep hover:shadow-elevated active:scale-[0.97] disabled:bg-primary-muted disabled:shadow-none',
  secondary:
    'bg-bg-secondary text-text border border-border hover:bg-bg-elevated hover:shadow-card active:scale-[0.98] disabled:opacity-50',
  ghost:
    'bg-transparent text-primary hover:bg-primary/8 active:bg-primary/12 disabled:opacity-50',
  accent:
    'gradient-accent text-text-inverse shadow-card hover:shadow-glow-accent active:scale-[0.97] disabled:opacity-50',
  danger:
    'bg-debt text-text-inverse shadow-card hover:bg-debt-deep hover:shadow-glow-debt active:scale-[0.97] disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  loading = false,
  compact = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-xl font-medium',
        'transition-all duration-[--duration-fast] ease-[--ease-spring]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:transform-none',
        compact ? 'h-9 gap-1.5 px-3 text-sm' : 'h-12 w-full gap-2 px-5 text-sm',
        variantClasses[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Cargando…
        </>
      ) : (
        children
      )}
    </button>
  )
}
