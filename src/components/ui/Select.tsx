import { type SelectHTMLAttributes, type Ref, useId } from 'react'
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
  // `useId` como último recurso: sin él, un campo sin `name` ni `id` quedaba con
  // la etiqueta suelta — tocarla no enfocaba el campo y un lector de pantalla no
  // la anunciaba. Era el caso de casi todos los formularios.
  const generado = useId()
  const selectId = id ?? props.name ?? generado

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
