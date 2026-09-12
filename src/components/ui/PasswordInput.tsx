import { type InputHTMLAttributes, type Ref, useId, useState } from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import clsx from 'clsx'
import { fuerzaPassword, type Fuerza } from '@/lib/password'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  /** Muestra el medidor de fuerza. Sólo para contraseñas nuevas. */
  showStrength?: boolean
  /** Valor actual, para el medidor. El campo sigue siendo no controlado. */
  strengthValue?: string
  ref?: Ref<HTMLInputElement>
}

const TONO: Record<Fuerza, { barra: string; texto: string; ancho: string }> = {
  'débil':     { barra: 'bg-debt',    texto: 'text-debt-deep',    ancho: 'w-1/4' },
  'aceptable': { barra: 'bg-peach',   texto: 'text-peach-deep',   ancho: 'w-2/4' },
  'buena':     { barra: 'bg-primary', texto: 'text-primary-deep', ancho: 'w-3/4' },
  'fuerte':    { barra: 'bg-asset',   texto: 'text-asset-deep',   ancho: 'w-full' },
}

/**
 * Campo de contraseña con botón de ver/ocultar.
 *
 * El `Input` de la app no tiene forma de alternar la visibilidad, y escribir a
 * ciegas una contraseña de 10+ caracteres en un teclado de teléfono es la receta
 * para que la gente elija algo corto. Ver lo que se escribe es una medida de
 * seguridad, no una comodidad.
 */
export function PasswordInput({
  label,
  error,
  showStrength = false,
  strengthValue = '',
  className,
  id,
  ref,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const generado = useId()
  const inputId = id ?? props.name ?? generado
  const fuerza = fuerzaPassword(strengthValue)
  const tono = TONO[fuerza]

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={clsx(
            'h-12 w-full rounded-xl border bg-bg-elevated pl-4 pr-12 text-base text-text',
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
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          // tabIndex -1: al tabular desde el correo se va al campo siguiente,
          // no a este botón, que es lo que espera quien usa un gestor.
          tabIndex={-1}
          className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-text-tertiary transition-colors hover:text-text-secondary"
        >
          {visible ? <IconEyeOff size={18} stroke={2} /> : <IconEye size={18} stroke={2} />}
        </button>
      </div>

      {showStrength && strengthValue.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-secondary">
            <span className={clsx('block h-full rounded-full transition-all', tono.barra, tono.ancho)} />
          </span>
          <span className={clsx('text-[11px] font-bold', tono.texto)}>{fuerza}</span>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-xs text-debt">
          <span aria-hidden="true">•</span> {error}
        </p>
      )}
    </div>
  )
}
