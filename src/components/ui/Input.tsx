import { type InputHTMLAttributes, type Ref } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function Input({
  label,
  error,
  className,
  id,
  ref,
  ...props
}: InputProps) {
  const inputId = id ?? props.name

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          'h-12 rounded-xl border bg-bg-elevated px-4 text-sm text-text',
          'placeholder:text-text-tertiary',
          'transition-all duration-[--duration-fast]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary',
          error
            ? 'border-debt ring-1 ring-debt/20'
            : 'border-border hover:border-border-strong',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && (
        <p className="flex items-center gap-1 text-xs text-debt">
          <span aria-hidden="true">•</span> {error}
        </p>
      )}
    </div>
  )
}
