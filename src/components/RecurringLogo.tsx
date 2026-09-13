import { useState } from 'react'
import clsx from 'clsx'
import { logoUrl } from '@/lib/logos'
import { findBrand } from '@/lib/brands'
import { ICONO_GENERICO, servicePreset } from '@/lib/services'
import type { Subscription } from '@/types'

/**
 * El logo de un cargo recurrente, con la misma cascada que `AccountCard`:
 *
 *   logo real  →  si la imagen falla, icono del proveedor  →  si no hay, genérico
 *
 * El `onError` no es adorno: el favicon de un dominio puede no existir, y sin
 * esa caída queda un hueco roto en la lista. Es exactamente lo que ya hace la
 * pantalla de cuentas, así que las dos se ven igual.
 *
 * El proveedor sale de `brand_id`, que ya existía en la tabla: sirve tanto para
 * las marcas de suscripción (Netflix) como para los presets de servicio (CFE),
 * y por eso esto no necesitó migración.
 */
export function RecurringLogo({
  sub,
  size = 42,
  className,
}: {
  sub: Pick<Subscription, 'brand_id' | 'name' | 'color' | 'kind'>
  size?: number
  className?: string
}) {
  const [falló, setFalló] = useState(false)

  const servicio = servicePreset(sub.brand_id)
  const marca = servicio ? undefined : findBrand(sub.brand_id ?? sub.name ?? '')
  const dominio = servicio?.domain ?? null
  const color = servicio?.color ?? marca?.color ?? sub.color ?? '#6B7194'
  const Icono = servicio?.icon ?? ICONO_GENERICO
  const conLogo = !!dominio && !falló

  const iniciales =
    marca?.initials ?? (sub.name ? sub.name.trim().slice(0, 2).toUpperCase() : '?')

  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center overflow-hidden text-white',
        conLogo && 'bg-white shadow-sm',
        className,
      )}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: size * 0.3,
        background: conLogo ? '#fff' : color,
      }}
    >
      {conLogo ? (
        <img
          src={logoUrl(dominio!)}
          alt={sub.name}
          className="object-contain"
          style={{ width: size * 0.66, height: size * 0.66 }}
          onError={() => setFalló(true)}
        />
      ) : servicio ? (
        <Icono size={size * 0.5} stroke={2} />
      ) : (
        <span style={{ fontSize: size * 0.35, fontWeight: 800, letterSpacing: '-0.03em' }}>
          {iniciales}
        </span>
      )}
    </div>
  )
}
