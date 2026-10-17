import { useState } from 'react'
import { IconCheck, IconCreditCardPay, IconDotsVertical, IconPencil, IconTrash, IconRotate } from '@tabler/icons-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { lineaDeEstado } from '@/lib/msiTexto'
import { formatMXN } from '@/lib/format'
import { fechaCorta } from '@/lib/movementDates'
import { sugerirFechaDeCompra, type EstadoMes, type InstallmentVivo, type MesMsi } from '@/lib/msi'
import type { Account } from '@/types'

interface InstallmentDetailModalProps {
  installment: InstallmentVivo
  linkedAccount?: Account
  hoy: string
  onClose: () => void
  onEdit: () => void
  onMarcarMes: (n: number, e: 'paid' | 'unpaid' | 'auto') => Promise<void>
  onLiquidar: (restarDelSaldo: boolean) => Promise<void>
  onEliminar: (quitarCargo: boolean) => Promise<void>
  onCambiarFechaDeCompra: (fecha: string) => Promise<void>
  /** Pagar la tarjeta del plan (el pago real que cubre la mensualidad). */
  onPagarTarjeta?: () => void
}

const ESTADO: Record<EstadoMes, { texto: string; clase: string }> = {
  pagada: { texto: 'Pagada', clase: 'bg-asset-soft text-asset-ink' },
  'por-pagar': { texto: 'Por pagar', clase: 'bg-warning/30 text-peach-ink' },
  vencida: { texto: 'Vencida', clase: 'bg-debt/10 text-debt-ink' },
  proxima: { texto: 'Próxima', clase: 'bg-bg-secondary text-text-secondary' },
}

/** Por qué un mes está como está. Es la parte «transparente». */
function porQue(m: MesMsi, tarjeta: string | undefined): string {
  if (m.origen === 'anterior') return 'La traías marcada de antes'
  if (m.origen === 'manual') {
    const cuando = m.marcadaEl ? ` el ${fechaCorta(m.marcadaEl)}` : ''
    return m.estado === 'pagada' ? `La marcaste pagada${cuando}` : `Marcaste que no la pagaste${cuando}`
  }
  if (m.porPagos) {
    if (m.estado === 'pagada') return `Cubierta con tus pagos a ${tarjeta ?? 'la tarjeta'}`
    if (m.estado === 'vencida') return 'Tu pago no alcanzó esta mensualidad'
  }
  if (m.estado === 'pagada') return 'Pagada sola: pasó su fecha límite'
  if (m.estado === 'por-pagar') return 'Ya está en tu estado de cuenta'
  return 'Aún no se cobra'
}

/**
 * Un plan a meses, mes por mes.
 *
 * Responde «¿en cuál voy, qué pasó con cada mes y por qué?», y deja corregir
 * cualquiera sin borrar el plan: marcar pagada, «no la pagué», volver a lo que
 * digan las fechas. También muestra el movimiento que lo respalda en la tarjeta.
 */
export function InstallmentDetailModal({
  installment: inst,
  linkedAccount,
  hoy,
  onClose,
  onEdit,
  onMarcarMes,
  onLiquidar,
  onEliminar,
  onCambiarFechaDeCompra,
  onPagarTarjeta,
}: InstallmentDetailModalProps) {
  const { msi, cargo } = inst
  const M = msi.meses.length
  const [menuMes, setMenuMes] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmarLiquidar, setConfirmarLiquidar] = useState(false)
  const [restar, setRestar] = useState(true)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  // Con pagos hechos, esos pagos ya bajaron el saldo: quitar el cargo completo
  // lo dejaría por debajo de lo real.
  const [quitarCargo, setQuitarCargo] = useState(msi.pagadas === 0)
  const sugerida = sugerirFechaDeCompra(inst, inst.ciclo, hoy)
  const linea = lineaDeEstado(inst)
  const conTarjeta = linkedAccount?.type === 'credit'
  const enCurso = !!msi.actual && (msi.actual.estado === 'por-pagar' || msi.actual.estado === 'vencida')

  async function correr(clave: string, f: () => Promise<void>) {
    setOcupado(clave)
    setError('')
    try {
      await f()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title={inst.name}>
        <div className="flex flex-col gap-4">
          {/* Dónde vas */}
          <div className="rounded-2xl bg-primary-soft/40 px-4 py-3">
            <p className="text-[12px] font-semibold text-primary-deep">
              {msi.terminado ? 'Plan terminado' : `Mensualidad ${msi.actual?.n} de ${M}`}
            </p>
            <p className="mt-0.5 font-mono text-[22px] font-extrabold tabular-nums text-text">
              {formatMXN(msi.restante)}
              <span className="ml-1.5 font-sans text-[12px] font-semibold text-text-secondary">por pagar</span>
            </p>
            <p className={clsx('mt-0.5 text-[12.5px]', linea.tono === 'alerta' ? 'font-semibold text-debt-ink' : 'text-text-secondary')}>
              {linea.texto}
            </p>
            <p className="mt-2 text-[12px] text-text-secondary">
              {msi.pagadas} pagada{msi.pagadas === 1 ? '' : 's'} · {formatMXN(Number(inst.total_amount))} en {M} meses
              {linkedAccount ? ` · ${linkedAccount.name}` : ' · sin tarjeta'}
            </p>
            {conTarjeta && enCurso && onPagarTarjeta && (
              <Button compact className="mt-2.5" onClick={onPagarTarjeta}>
                <IconCreditCardPay size={15} /> Pagar {linkedAccount!.name}
              </Button>
            )}
          </div>

          {sugerida && (
            <div className="rounded-xl border border-border bg-bg-elevated px-3.5 py-3">
              <p className="text-[12.5px] leading-snug text-text-secondary">
                Hay {msi.adelantadas} mensualidad{msi.adelantadas === 1 ? '' : 'es'} marcada{msi.adelantadas === 1 ? '' : 's'} antes de entrar a un corte.
                ¿Compraste antes? Con la fecha correcta las mensualidades avanzan solas.
              </p>
              <Button
                compact
                variant="secondary"
                className="mt-2"
                loading={ocupado === 'fecha'}
                onClick={() => void correr('fecha', () => onCambiarFechaDeCompra(sugerida))}
              >
                Cambiar la compra al {fechaCorta(sugerida)}
              </Button>
            </div>
          )}

          {/* Mes por mes */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Mes por mes</p>
            <ol className="flex flex-col divide-y divide-border rounded-2xl bg-bg-elevated px-3 shadow-card">
              {msi.meses.map((m) => {
                const esActual = msi.actual?.n === m.n
                return (
                  <li key={m.n} className={clsx('py-2.5', esActual && 'bg-primary-soft/20 -mx-3 px-3')}>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={clsx(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold',
                          m.estado === 'pagada' ? 'bg-asset-soft text-asset-ink' : 'bg-bg-secondary text-text',
                        )}
                        aria-hidden
                      >
                        {m.estado === 'pagada' ? <IconCheck size={14} stroke={2.75} /> : m.n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-text">
                          <span className="sr-only">Mensualidad {m.n}: </span>
                          Vence {fechaCorta(m.vence)}
                          {m.venceEstimado ? ' (aprox.)' : ''}
                        </p>
                        <p className="text-[11.5px] leading-snug text-text-secondary">
                          {m.corte ? `Corte ${fechaCorta(m.corte)} · ` : ''}
                          {porQue(m, linkedAccount?.name)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-mono text-[12.5px] font-bold tabular-nums text-text">{formatMXN(m.monto)}</span>
                        <span className={clsx('whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-bold', ESTADO[m.estado].clase)}>
                          {ESTADO[m.estado].texto}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMenuMes((v) => (v === m.n ? null : m.n))}
                        aria-expanded={menuMes === m.n}
                        aria-label={`Cambiar la mensualidad ${m.n}`}
                        className="-mr-1 grid h-10 w-8 shrink-0 place-items-center rounded-lg text-text-secondary hover:bg-bg-secondary"
                      >
                        <IconDotsVertical size={16} />
                      </button>
                    </div>
                    {menuMes === m.n && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                        {m.estado !== 'pagada' && (
                          <AccionMes ocupado={ocupado === `m${m.n}`} onClick={() => void correr(`m${m.n}`, async () => { await onMarcarMes(m.n, 'paid'); setMenuMes(null) })}>
                            <IconCheck size={13} /> Marcar pagada
                          </AccionMes>
                        )}
                        {m.estado !== 'vencida' && (m.vence < hoy || m.estado === 'pagada') && (
                          <AccionMes ocupado={ocupado === `u${m.n}`} onClick={() => void correr(`u${m.n}`, async () => { await onMarcarMes(m.n, 'unpaid'); setMenuMes(null) })}>
                            No la pagué
                          </AccionMes>
                        )}
                        {m.origen !== 'auto' && (
                          <AccionMes ocupado={ocupado === `a${m.n}`} onClick={() => void correr(`a${m.n}`, async () => { await onMarcarMes(m.n, 'auto'); setMenuMes(null) })}>
                            <IconRotate size={13} /> Quitar mi marca
                          </AccionMes>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
            <p className="mt-1.5 text-[11.5px] leading-snug text-text-secondary">
              {conTarjeta
                ? `Cada mensualidad se marca sola cuando tus pagos a ${linkedAccount!.name} la cubren. Marcarla a mano no mueve tu saldo.`
                : 'Marcar una mensualidad no mueve tu saldo: el pago lo registras como siempre.'}
              {linkedAccount?.cut_day ? ` Calculado con el corte actual (día ${linkedAccount.cut_day}).` : ''}
            </p>
          </div>

          {/* El movimiento que lo respalda */}
          <div className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12.5px] text-text-secondary">
            {cargo ? (
              <>
                Cargo a <b className="text-text">{linkedAccount?.name ?? 'la tarjeta'}</b> ·{' '}
                <b className="font-mono text-text">{formatMXN(cargo.amount)}</b> · {fechaCorta(cargo.date)}
              </>
            ) : linkedAccount ? (
              'Sin cargo: elegiste que la compra ya estaba en el saldo de la tarjeta.'
            ) : (
              'Sin tarjeta: las mensualidades salen de tu efectivo el día que vencen.'
            )}
          </div>

          {error && <p className="text-[12.5px] font-semibold text-debt-ink">• {error}</p>}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onEdit}>
              <IconPencil size={15} /> Editar
            </Button>
            {!msi.terminado ? (
              <Button variant="secondary" onClick={() => setConfirmarLiquidar(true)}>
                <IconCheck size={15} /> Liquidar
              </Button>
            ) : (
              <span />
            )}
          </div>
          <button
            type="button"
            onClick={() => setConfirmarBorrar(true)}
            className="flex min-h-[44px] items-center justify-center gap-1.5 text-[13px] font-semibold text-debt-ink"
          >
            <IconTrash size={15} /> Eliminar plan
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmarLiquidar}
        title="Liquidar el resto"
        message={`Las ${M - msi.pagadas} mensualidades que faltan (${formatMXN(msi.restante)}) quedan pagadas hoy.`}
        confirmLabel="Liquidar"
        onClose={() => setConfirmarLiquidar(false)}
        onConfirm={() => void correr('liquidar', () => onLiquidar(restar && !!linkedAccount))}
      >
        {linkedAccount && (
          <label className="flex min-h-[44px] items-center gap-2.5 text-[13px] text-text">
            <input type="checkbox" checked={restar} onChange={(e) => setRestar(e.target.checked)} className="h-5 w-5 accent-primary" />
            Restar {formatMXN(msi.restante)} del saldo de {linkedAccount.name}
          </label>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={confirmarBorrar}
        title="Eliminar plan"
        destructive
        confirmLabel="Eliminar"
        message={`Se borra «${inst.name}» y su calendario de mensualidades.`}
        onClose={() => setConfirmarBorrar(false)}
        onConfirm={() => void correr('borrar', () => onEliminar(quitarCargo && !!cargo))}
      >
        {cargo && (
          <label className="flex min-h-[44px] items-start gap-2.5 text-[13px] text-text">
            <input type="checkbox" checked={quitarCargo} onChange={(e) => setQuitarCargo(e.target.checked)} className="mt-0.5 h-5 w-5 accent-primary" />
            <span>
              Quitar también el cargo de {formatMXN(cargo.amount)} de {linkedAccount?.name ?? 'la tarjeta'}
              {msi.pagadas > 0 && (
                <span className="block text-[12px] text-text-secondary">
                  Ya pagaste {msi.pagadas}: esos pagos bajaron el saldo, así que quitar el cargo completo lo dejaría por debajo de lo real.
                </span>
              )}
            </span>
          </label>
        )}
      </ConfirmModal>
    </>
  )
}

function AccionMes({ children, onClick, ocupado }: { children: React.ReactNode; onClick: () => void; ocupado: boolean }) {
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={onClick}
      className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border bg-bg px-3 text-[12px] font-bold text-text transition-colors hover:border-primary/40 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
