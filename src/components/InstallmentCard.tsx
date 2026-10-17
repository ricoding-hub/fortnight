import { useState } from 'react'
import { IconCalendarEvent, IconCheck, IconChevronRight, IconCreditCardPay } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { formatMXN } from '@/lib/format'
import { lineaDeEstado } from '@/lib/msiTexto'
import { bankLogoUrl } from '@/lib/banks'
import type { InstallmentVivo } from '@/lib/msi'
import type { Account } from '@/types'

interface InstallmentCardProps {
  installment: InstallmentVivo
  linkedAccount?: Account
  /** Abre el detalle mes por mes. */
  onOpen: () => void
  /** «Ya la pagué»: sólo cuando la mensualidad en curso ya está en el estado de cuenta. */
  onPagarActual?: () => void
  /**
   * En un plan con tarjeta, la mensualidad se cubre pagando la tarjeta: el botón
   * abre el pago real en vez de marcarla sin mover dinero.
   */
  onPagarTarjeta?: () => void
}

/**
 * Un plan a meses de un vistazo: en qué mensualidad vas, qué toca y cuándo.
 *
 * Antes era un contador («3/12 meses») con un botón «Marcar mes pagado» que
 * había que acordarse de tocar cada mes. Ahora el avance sale de las fechas de
 * la tarjeta, y el detalle (al tocarla) deja corregir cualquier mes.
 */
export function InstallmentCard({ installment: inst, linkedAccount, onOpen, onPagarActual, onPagarTarjeta }: InstallmentCardProps) {
  const [logoFailed, setLogoFailed] = useState(false)
  const { msi } = inst
  const M = msi.meses.length
  const enEstado = msi.meses.filter((m) => m.estado === 'por-pagar' || m.estado === 'vencida').length
  const linea = lineaDeEstado(inst)
  const showLogo = !!linkedAccount?.logo_domain && !logoFailed
  const enCurso = !!msi.actual && (msi.actual.estado === 'por-pagar' || msi.actual.estado === 'vencida')
  const conTarjeta = linkedAccount?.type === 'credit' && !!onPagarTarjeta
  const puedePagar = enCurso && (conTarjeta || !!onPagarActual)

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${inst.name}: ver mensualidades`}
        className="flex w-full items-start gap-3 p-3.5 text-left transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <div
          className={clsx(
            'grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl',
            showLogo ? 'bg-white' : msi.terminado ? 'bg-asset-soft' : 'bg-primary-soft',
          )}
        >
          {showLogo ? (
            <img
              src={bankLogoUrl(linkedAccount!.logo_domain!)}
              alt=""
              className="h-6 w-6 object-contain"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <IconCalendarEvent size={18} stroke={1.75} className={msi.terminado ? 'text-asset-deep' : 'text-primary-deep'} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 truncate text-[13.5px] font-bold text-text">{inst.name}</p>
            <span
              className={clsx(
                'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold',
                msi.terminado ? 'bg-asset-soft text-asset-ink' : 'bg-primary-soft text-primary-deep',
              )}
            >
              {msi.terminado ? 'Terminado' : `Mensualidad ${msi.actual?.n ?? M} de ${M}`}
            </span>
          </div>
          <p
            className={clsx(
              'mt-0.5 text-[12px] leading-snug',
              linea.tono === 'alerta' ? 'font-semibold text-debt-ink' : linea.tono === 'listo' ? 'text-asset-ink' : 'text-text-secondary',
            )}
          >
            {linea.texto}
          </p>

          {/* Pagadas · en estado de cuenta · por cobrar */}
          <div
            className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-bg-secondary"
            role="img"
            aria-label={`${msi.pagadas} pagadas, ${enEstado} en estado de cuenta, ${M - msi.pagadas - enEstado} por cobrar`}
          >
            <span className="h-full bg-asset" style={{ width: `${(msi.pagadas / M) * 100}%` }} />
            <span className="h-full bg-warning" style={{ width: `${(enEstado / M) * 100}%` }} />
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-2 text-[11.5px] text-text-secondary">
            <span className="font-mono font-bold tabular-nums text-text">{formatMXN(msi.actual?.monto ?? Number(inst.monthly_amount))}/mes</span>
            <span>·</span>
            <span>
              {msi.terminado ? `Total ${formatMXN(Number(inst.total_amount))}` : `Resta ${formatMXN(msi.restante)}`}
            </span>
            {!inst.is_zero_interest && (
              <>
                <span>·</span>
                <span>Con interés</span>
              </>
            )}
          </p>
        </div>
        <IconChevronRight size={16} className="mt-2.5 shrink-0 text-text-secondary" />
      </button>
      {puedePagar && (
        <div className="border-t border-border px-3.5 py-2">
          {conTarjeta ? (
            <button
              type="button"
              onClick={onPagarTarjeta}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-primary-deep transition-colors hover:bg-primary-soft/60"
            >
              <IconCreditCardPay size={14} stroke={2.25} /> Pagar {linkedAccount!.name}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPagarActual}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-asset-ink transition-colors hover:bg-asset-soft/60"
            >
              <IconCheck size={14} stroke={2.5} /> Ya pagué la mensualidad {msi.actual!.n}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
