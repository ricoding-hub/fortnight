import { IconCheck, IconLink } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatMXN } from '@/lib/format'

interface BalanceHeroProps {
  /** Conexión 1:1 (dos personas) o grupo de tres o más. */
  isDirect: boolean
  /** Nombre del contacto (1:1) o del grupo. */
  nombre: string
  /** Tu saldo: + te deben, − debes. */
  miSaldo: number
  /** Lo que se ha gastado entre todos. Informativo, no el titular. */
  totalGastado: number
  /** «Saldar todo». Sólo en 1:1 y con saldo pendiente. */
  onSaldarTodo?: () => void
  /** «Abonar otro monto»: abre la liquidación con el monto editable. */
  onAbonar?: () => void
  /** 1:1 sin conectar: invitar a esa persona a conectar su cuenta. */
  onInvitar?: () => void
}

/**
 * Lo único que importa de esta pantalla, UNA vez y en grande.
 *
 * Antes el mismo número aparecía cinco veces en la primera pantalla — «Tu
 * balance», «Saldar todo», las dos filas de Balances (+ y −, espejo una de la
 * otra) y «Para saldar → Liquidar» — y dejaba el primer movimiento fuera de la
 * vista. Aquí hay una cifra y la acción que la resuelve; el total gastado queda
 * como dato pequeño, porque sólo informa: no es lo que debes.
 */
export function BalanceHero({
  isDirect,
  nombre,
  miSaldo,
  totalGastado,
  onSaldarTodo,
  onAbonar,
  onInvitar,
}: BalanceHeroProps) {
  const aMano = Math.abs(miSaldo) < 0.005
  const teDeben = miSaldo > 0

  const titulo = aMano
    ? 'Están a mano'
    : isDirect
      ? teDeben ? `${nombre} te debe` : `Le debes a ${nombre}`
      : teDeben ? 'Te deben en total' : 'Debes en total'

  return (
    <Card className="px-4 py-3.5">
      <p
        className={clsx(
          'text-[12.5px] font-bold',
          aMano ? 'text-text-secondary' : teDeben ? 'text-asset-ink' : 'text-debt-ink',
        )}
      >
        {titulo}
      </p>

      {aMano ? (
        <p className="mt-0.5 text-[13px] text-text-secondary">Sin saldo pendiente.</p>
      ) : (
        <p
          className={clsx(
            'mt-0.5 font-mono text-[34px] font-extrabold leading-none tabular-nums',
            teDeben ? 'text-asset-ink' : 'text-debt-ink',
          )}
        >
          {formatMXN(Math.abs(miSaldo))}
        </p>
      )}

      {onSaldarTodo && !aMano && (
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={onSaldarTodo} className="flex-1">
            <IconCheck size={16} stroke={2.5} /> Saldar todo
          </Button>
          {onAbonar && (
            <button
              type="button"
              onClick={onAbonar}
              className="shrink-0 px-1 py-2 text-[12.5px] font-bold text-primary-deep underline-offset-2 hover:underline"
            >
              Abonar otro monto
            </button>
          )}
        </div>
      )}

      {onInvitar && (
        <button
          type="button"
          onClick={onInvitar}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-soft/60 py-2.5 text-[12.5px] font-bold text-primary-deep transition-colors hover:bg-primary-soft"
        >
          <IconLink size={14} /> Invitar a {nombre} a conectarse
        </button>
      )}

      <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-text-secondary">
        Gastado entre {isDirect ? 'ustedes' : 'todos'}{' '}
        <span className="font-mono font-bold tabular-nums text-text">{formatMXN(totalGastado)}</span>
      </p>
    </Card>
  )
}
