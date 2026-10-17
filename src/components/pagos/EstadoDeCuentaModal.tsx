import { useState } from 'react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { usePagarTarjeta } from '@/hooks/usePagarTarjeta'
import { formatMXN } from '@/lib/format'
import { isMoneyInput, moneyNum } from '@/lib/money'
import { fechaCorta } from '@/lib/movementDates'
import type { EstadoDeCuenta, EstadosTarjeta } from '@/lib/estadoDeCuenta'
import type { Account } from '@/types'

interface EstadoDeCuentaModalProps {
  tarjeta: Account
  estados: EstadosTarjeta | undefined
  conCorrecciones: boolean
  onClose: () => void
  /** Abrir el pago con lo que falta de ESTE estado (con dos abiertos, no siempre es el próximo). */
  onPagar: (monto?: number) => void
}

const ESTADO: Record<EstadoDeCuenta['estado'], { texto: string; clase: string }> = {
  'sin-saldo': { texto: 'Sin saldo', clase: 'bg-bg-secondary text-text-secondary' },
  pagado: { texto: 'Pagado', clase: 'bg-asset-soft text-asset-ink' },
  pendiente: { texto: 'Pendiente', clase: 'bg-warning/30 text-peach-ink' },
  vencido: { texto: 'Venció', clase: 'bg-debt/10 text-debt-ink' },
}

/**
 * El estado de cuenta de una tarjeta, como lo calcula el banco: qué entró en el
 * corte, qué MSI aún no se cobra, cuánto pagar para no generar intereses, qué
 * llevas pagado y cuánto te falta. Si tu estado de cuenta dice otra cosa, se
 * captura y manda sobre el cálculo.
 */
export function EstadoDeCuentaModal({ tarjeta, estados, conCorrecciones, onClose, onPagar }: EstadoDeCuentaModalProps) {
  // Los que aún importan: los que no quedaron dentro de un corte más nuevo.
  const visibles = (estados?.estados ?? []).filter((e) => !e.absorbido && e.estado !== 'sin-saldo')
  const porDefecto = estados?.proximo ?? visibles[visibles.length - 1] ?? estados?.ultimo ?? null
  const [corteElegido, setCorteElegido] = useState(porDefecto?.corte ?? null)
  const e = (estados?.estados ?? []).find((x) => x.corte === corteElegido) ?? porDefecto

  return (
    <Modal
      open
      onClose={onClose}
      title={`Estado de cuenta · ${tarjeta.name}`}
      footer={
        e && e.falta > 0 ? (
          <Button onClick={() => onPagar(e.falta)}>Pagar {formatMXN(e.falta)}</Button>
        ) : (
          <Button variant="secondary" onClick={() => onPagar()}>
            Registrar un pago
          </Button>
        )
      }
    >
      {!estados ? (
        <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-[13px] text-text-secondary">
          Ahora no pude calcular el estado de cuenta de {tarjeta.name} (revisa tu conexión). Vuelve a abrirlo en un momento.
        </p>
      ) : estados.sinCorte || !e ? (
        <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-[13px] text-text-secondary">
          Para calcular tu estado de cuenta hace falta el día de corte de {tarjeta.name}. Agrégalo en Cuentas → ajustes de la
          tarjeta.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.length > 1 && (
            <div role="tablist" aria-label="Estados abiertos" className="flex gap-1.5">
              {visibles.map((v) => (
                <button
                  key={v.corte}
                  type="button"
                  role="tab"
                  aria-selected={v.corte === e.corte}
                  onClick={() => setCorteElegido(v.corte)}
                  className={clsx(
                    'min-h-[36px] rounded-full px-3 text-[12.5px] font-bold',
                    v.corte === e.corte ? 'bg-primary-deep text-white' : 'bg-bg-secondary text-text-secondary',
                  )}
                >
                  Corte {fechaCorta(v.corte)}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-2xl bg-primary-soft/40 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-primary-deep">
                Corte {fechaCorta(e.corte)} · vence {fechaCorta(e.vence)}
                {e.venceEstimado ? ' (aprox.)' : ''}
              </p>
              <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', ESTADO[e.estado].clase)}>
                {ESTADO[e.estado].texto}
              </span>
            </div>
            <p className="mt-1 font-mono text-[24px] font-extrabold tabular-nums text-text">{formatMXN(e.falta)}</p>
            <p className="text-[12.5px] text-text-secondary">
              {e.falta > 0
                ? `te falta para no generar intereses${e.corregido ? '' : ' (aprox.)'}`
                : 'no te falta nada de este estado'}
            </p>
            {e.minimoFalta > 0 && e.minimoFalta < e.falta && (
              <p className="mt-1 text-[12px] text-text-secondary">
                Pago mínimo{e.corregido ? '' : ' (aprox.)'}: <b className="font-mono text-text">{formatMXN(e.minimoFalta)}</b>
              </p>
            )}
          </div>

          <dl className="flex flex-col divide-y divide-border rounded-2xl bg-bg-elevated px-4 text-[13px] shadow-card">
            <Fila etiqueta="Saldo al corte" valor={formatMXN(e.saldoAlCorte)} />
            {e.msiNoFacturado > 0 && (
              <Fila etiqueta="Menos: MSI que aún no se cobra" valor={`−${formatMXN(e.msiNoFacturado)}`} />
            )}
            <Fila
              etiqueta={e.corregido ? 'Pago para no generar intereses (de tu banco)' : 'Pago para no generar intereses'}
              valor={formatMXN(e.pngi)}
              fuerte
            />
            {e.msiDelCorte > 0 && <Fila etiqueta="Incluye mensualidades MSI" valor={formatMXN(e.msiDelCorte)} tenue />}
            <Fila etiqueta="Pagado desde el corte" valor={e.pagado > 0 ? `−${formatMXN(e.pagado)}` : formatMXN(0)} />
            {e.compras > 0 && (
              <Fila
                etiqueta={`Compras desde el corte (van a tu estado del ${estados?.siguiente ? fechaCorta(estados.siguiente.corte) : 'próximo corte'})`}
                valor={formatMXN(e.compras)}
                tenue
              />
            )}
          </dl>

          {e.abonos.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Pagos y abonos</p>
              <ul className="flex flex-col gap-1">
                {e.abonos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-[12.5px] text-text-secondary">
                    <span className="min-w-0 truncate">
                      {fechaCorta(a.date.slice(0, 10))} · {a.description || (a.type === 'adjustment' ? 'Ajuste de saldo' : 'Pago')}
                    </span>
                    <span className="font-mono font-semibold text-asset-ink">{formatMXN(Math.abs(Number(a.amount)))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(e.aproximado || e.ajustesAlAlza > 0) && !e.corregido && (
            <p className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12px] leading-snug text-text-secondary">
              {e.aproximado === 'alta'
                ? 'Diste de alta la tarjeta después de este corte, así que la app no sabe qué compras entraron. Captura la cifra de tu estado de cuenta.'
                : e.aproximado === 'msi-sin-respaldo'
                  ? 'Hay mensualidades MSI que no están en el saldo de la tarjeta. Revisa el saldo o captura la cifra de tu estado de cuenta.'
                  : `Subiste el saldo a mano después del corte (${formatMXN(e.ajustesAlAlza)}). Se tomó como compra nueva; si era de antes del corte, captura la cifra de tu estado de cuenta.`}
            </p>
          )}

          {/* `key` por corte: lo escrito en una pestaña no se guarda en otra. */}
          {conCorrecciones && <Corregir key={e.corte} tarjeta={tarjeta} estado={e} />}
        </div>
      )}
    </Modal>
  )
}

function Fila({ etiqueta, valor, fuerte, tenue }: { etiqueta: string; valor: string; fuerte?: boolean; tenue?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className={clsx('min-w-0', tenue ? 'text-text-secondary' : 'text-text', fuerte && 'font-bold')}>{etiqueta}</dt>
      <dd className={clsx('shrink-0 font-mono tabular-nums', fuerte ? 'font-bold text-text' : 'text-text')}>{valor}</dd>
    </div>
  )
}

function Corregir({ tarjeta, estado }: { tarjeta: Account; estado: EstadoDeCuenta }) {
  const toast = useToast()
  const { corregirEstado, quitarCorreccion } = usePagarTarjeta()
  const [abierto, setAbierto] = useState(false)
  const [pngi, setPngi] = useState(estado.corregido ? String(estado.pngi) : '')
  // Lo ya capturado se conserva: volver a guardar sólo el PNGI borraba el mínimo.
  const [minimo, setMinimo] = useState(estado.minimoBanco != null ? String(estado.minimoBanco) : '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    if (!isMoneyInput(pngi, { allowZero: true })) return setError('Escribe el pago para no generar intereses de tu estado de cuenta')
    if (minimo && !isMoneyInput(minimo, { allowZero: true })) return setError('El pago mínimo no es un monto válido')
    setGuardando(true)
    try {
      await corregirEstado(tarjeta.id, estado.corte, { pngi: moneyNum(pngi), minimo: minimo ? moneyNum(minimo) : null })
      toast.success('Estado de cuenta corregido', `${tarjeta.name} · corte ${fechaCorta(estado.corte)}`)
      setAbierto(false)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <div className="flex flex-wrap gap-x-4">
        <button type="button" onClick={() => setAbierto(true)} className="min-h-[40px] text-[13px] font-bold text-primary-deep">
          {estado.corregido ? 'Cambiar la cifra de mi banco' : '¿Tu estado de cuenta dice otra cosa? Corrígelo'}
        </button>
        {estado.corregido && (
          <button
            type="button"
            onClick={() =>
              void quitarCorreccion(tarjeta.id, estado.corte)
                .then(() => toast.success('Se usa el cálculo de la app', ''))
                .catch(() => toast.error('No se pudo guardar', 'Inténtalo de nuevo'))
            }
            className="min-h-[40px] text-[13px] font-semibold text-text-secondary"
          >
            Usar el cálculo de la app
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border p-3.5">
      <p className="text-[12.5px] text-text-secondary">Copia las cifras de tu estado de cuenta del corte {fechaCorta(estado.corte)}.</p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Para no generar intereses" inputMode="decimal" value={pngi} onChange={(ev) => setPngi(ev.target.value)} />
        <Input label="Pago mínimo (opcional)" inputMode="decimal" value={minimo} onChange={(ev) => setMinimo(ev.target.value)} />
      </div>
      {error && <p className="text-[12.5px] font-semibold text-debt-ink">• {error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        <Button className="flex-1" loading={guardando} onClick={() => void guardar()}>
          Guardar
        </Button>
      </div>
    </div>
  )
}
