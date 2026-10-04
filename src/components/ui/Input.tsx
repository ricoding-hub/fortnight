import { type InputHTMLAttributes, type Ref, useId } from 'react'
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
  // `useId` como último recurso: sin él, un campo sin `name` ni `id` quedaba con
  // la etiqueta suelta — tocarla no enfocaba el campo y un lector de pantalla no
  // la anunciaba. Era el caso de casi todos los formularios.
  const generado = useId()
  const inputId = id ?? props.name ?? generado

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
          'h-12 rounded-xl border bg-bg-elevated px-4 text-base text-text',
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
