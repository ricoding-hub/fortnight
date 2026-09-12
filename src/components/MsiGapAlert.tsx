import { useState } from 'react'
import { IconAlertTriangle, IconChevronDown, IconPlus } from '@tabler/icons-react'
import clsx from 'clsx'
import { formatMXN } from '@/lib/format'
import type { Account } from '@/types'

interface MsiGapAlertProps {
  account: Account
  /** Cuánto principal a meses no cabe en el saldo actual. Siempre > 0. */
  gap: number
  /** Deja el saldo de la tarjeta en `nuevoSaldo`. Registra el ajuste. */
  onAgregar: (nuevoSaldo: number) => Promise<void>
}

/**
 * "A esta tarjeta le falta registrar un gasto."
 *
 * La versión anterior decía esto:
 *
 *   NU CREDITO tiene $2,976.19 a meses que su saldo no alcanza a cubrir. Si
 *   esas compras ya están en tu tarjeta, actualiza el saldo a $2,976.19 o más.
 *
 * Y quien la leyó preguntó, literalmente: "¿eso es bueno o malo?". Tenía razón
 * en no saberlo. El texto tenía tres problemas:
 *
 * - no decía si era un problema o una observación;
 * - metía dos cantidades distintas en la misma frase, una el hueco y otra el
 *   saldo objetivo, sin dejar claro cuál era cuál;
 * - y pedía una acción — "actualiza el saldo" — sin ofrecer dónde hacerla, así
 *   que había que salir a buscarla.
 *
 * Ahora dice qué pasa, por qué importa en términos de dinero, enseña el antes y
 * el después, y trae el botón que lo hace. El aviso desaparece solo cuando la
 * cuenta cuadra, porque se calcula del saldo, no de un estado que haya que
 * marcar como visto.
 */
export function MsiGapAlert({ account, gap, onAgregar }: MsiGapAlertProps) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [porQue, setPorQue] = useState(false)

  const saldoActual = Number(account.balance)
  const saldoNuevo = saldoActual + gap

  async function agregar() {
    setError('')
    setGuardando(true)
    try {
      await onAgregar(saldoNuevo)
    } catch {
      setError('No se pudo guardar. Inténtalo otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl border border-peach/40 bg-peach-soft/50 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <IconAlertTriangle size={15} className="mt-0.5 shrink-0 text-peach-deep" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold leading-snug text-text">
            Falta registrar un gasto en {account.name}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-text-secondary">
            Tienes <b className="font-mono text-text">{formatMXN(gap)}</b> a meses en esta
            tarjeta que su saldo todavía no incluye. Mientras falte, tu deuda real es
            mayor que la que ves en la app.
          </p>
        </div>
      </div>

      {/* El antes y el después, para que el botón no sea un salto al vacío. */}
      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-bg-elevated/70 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-text-tertiary">Saldo hoy</p>
          <p className="font-mono text-[13px] font-bold text-text-secondary">{formatMXN(saldoActual)}</p>
        </div>
        <IconChevronDown size={14} className="shrink-0 -rotate-90 text-text-tertiary" />
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-peach-deep/80">Quedaría en</p>
          <p className="font-mono text-[13px] font-extrabold text-text">{formatMXN(saldoNuevo)}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void agregar()}
        disabled={guardando}
        className={clsx(
          'mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-peach-deep py-2.5',
          'text-[13px] font-bold text-white transition-transform active:scale-[0.99]',
          'disabled:opacity-60',
        )}
      >
        <IconPlus size={15} stroke={2.5} />
        {guardando ? 'Guardando…' : `Agregar ${formatMXN(gap)} al saldo`}
      </button>

      {error && <p className="mt-1.5 text-center text-[11px] font-semibold text-debt">{error}</p>}

      <button
        type="button"
        onClick={() => setPorQue((v) => !v)}
        aria-expanded={porQue}
        className="mt-1.5 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-text-tertiary transition-colors hover:text-text-secondary"
      >
        ¿Por qué aparece esto?
        <IconChevronDown size={12} className={clsx('transition-transform', porQue && 'rotate-180')} />
      </button>

      {porQue && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-text-secondary">
          Al dar de alta el plan a meses elegiste «Sí, ya está» en el saldo de la
          tarjeta, pero el saldo guardado no da para cubrirlo. O la compra nunca
          llegó a cargarse, o el saldo se actualizó después con una cifra vieja.
          Agregarlo deja registrado el ajuste en tus movimientos, así que no se
          pierde el rastro de por qué cambió.
        </p>
      )}
    </div>
  )
}
