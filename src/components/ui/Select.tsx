import { type SelectHTMLAttributes, type Ref } from 'react'
import clsx from 'clsx'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  ref?: Ref<HTMLSelectElement>
}

export function Select({
  label,
  error,
  className,
  id,
  ref,
  children,
  ...props
}: SelectProps) {
  const selectId = id ?? props.name

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-text"
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={clsx(
          'h-12 rounded-xl border bg-bg-elevated px-4 text-base text-text',
          'transition-all duration-[--duration-fast]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary',
          error
            ? 'border-debt ring-1 ring-debt/20'
            : 'border-border hover:border-border-strong',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p className="flex items-center gap-1 text-xs text-debt">
          <span aria-hidden="true">•</span> {error}
        </p>
      )}
    </div>
  )
}
