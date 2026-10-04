import { type ReactNode } from 'react'
import clsx from 'clsx'

export interface SegmentedOption<T extends string | boolean> {
  value: T
  label: ReactNode
  /** Color de la opción activa. Por omisión, primario. */
  tone?: 'primary' | 'debt' | 'asset'
}

interface SegmentedProps<T extends string | boolean> {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Obligatorio: un grupo de opciones sin nombre no dice qué se está eligiendo. */
  ariaLabel: string
  className?: string
  /**
   * `equal`: todas del mismo ancho (2 opciones cortas). `content`: cada una toma
   * el ancho de su texto y el sobrante se reparte — para 3 o más opciones de
   * longitud distinta, donde partir el ancho en partes iguales truncaba
   * «Préstamo» y «A meses» en un teléfono.
   */
  ancho?: 'equal' | 'content'
}

const TONOS = {
  primary: 'bg-primary-deep text-white',
  debt: 'bg-debt-ink text-white',
  asset: 'bg-asset-ink text-white',
} as const

/**
 * Selector de 2–4 opciones excluyentes.
 *
 * Existía copiado en cuatro formularios, cada uno con sus clases y ninguno con
 * semántica: lectores de pantalla no sabían que eran opciones de un mismo
 * grupo. Aquí son un `radiogroup`, con objetivo táctil de 44 px y el color de la
 * opción activa pensado para el contraste (≥ 4.5:1 con texto blanco).
 */
export function Segmented<T extends string | boolean>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  ancho = 'equal',
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx('flex gap-1 rounded-xl bg-bg-secondary p-1', className)}
    >
      {options.map((o) => {
        const activa = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onChange(o.value)}
            className={clsx(
              'min-h-[40px] min-w-0 truncate whitespace-nowrap rounded-lg text-[13px] font-bold transition-colors active:scale-[0.98] motion-reduce:transition-none',
              ancho === 'content'
                ? 'flex-auto px-1.5 max-[340px]:px-0.5 max-[340px]:text-[12px]'
                : 'flex-1 px-2',
              activa ? TONOS[o.tone ?? 'primary'] : 'text-text-secondary hover:text-text',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
