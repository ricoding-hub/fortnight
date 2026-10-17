import { useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { usePagarTarjeta } from '@/hooks/usePagarTarjeta'
import { guardarPref, prefValida } from '@/lib/addPrefs'
import { formatMXN } from '@/lib/format'
import { toKey } from '@/lib/localDate'
import { isMoneyInput, moneyNum } from '@/lib/money'
import { fechaCorta } from '@/lib/movementDates'
import type { EstadosTarjeta } from '@/lib/estadoDeCuenta'
import type { Account } from '@/types'

type Opcion = 'falta' | 'minimo' | 'total' | 'otro'

interface PagarTarjetaModalProps {
  tarjeta: Account
  estados: EstadosTarjeta | undefined
  /** Cuentas de las que puede salir el dinero (débito). */
  cuentas: Account[]
  /** Un monto ya escrito: se elige la opción que coincide, o «Otro monto». */
  montoInicial?: number
  onClose: () => void
  onVerEstado?: () => void
}

/**
 * Pagar una tarjeta.
 *
 * Antes, «Pagar» abría un gasto: elegir la tarjeta SUBÍA su deuda, y elegir la
 * cuenta de débito no la tocaba. Aquí el pago baja la deuda de la tarjeta y,
 * si dices de dónde salió, el saldo de esa cuenta — un solo movimiento, que no
 * es ingreso ni gasto.
 */
export function PagarTarjetaModal({ tarjeta, estados, cuentas, montoInicial, onClose, onVerEstado }: PagarTarjetaModalProps) {
  const toast = useToast()
  const { pagar } = usePagarTarjeta()
  const proximo = estados?.proximo ?? null
  const saldo = Number(tarjeta.balance) || 0
  const debitos = cuentas.filter((c) => c.type === 'debit')

  const opciones: { id: Opcion; titulo: string; monto: number; nota?: string }[] = []
  if (proximo && proximo.falta > 0) {
    opciones.push({
      id: 'falta',
      titulo: 'Para no generar intereses',
      monto: proximo.falta,
      nota: proximo.corregido ? 'Según tu estado de cuenta' : 'Calculado por la app',
    })
    if (proximo.minimoFalta > 0 && proximo.minimoFalta < proximo.falta) {
      opciones.push({ id: 'minimo', titulo: 'Pago mínimo', monto: proximo.minimoFalta, nota: proximo.corregido ? undefined : 'Aprox.' })
    }
  }
  if (saldo > 0 && (!proximo || Math.abs(saldo - proximo.falta) > 0.005)) {
    opciones.push({ id: 'total', titulo: 'Todo el saldo', monto: saldo, nota: 'Incluye lo que aún no se cobra' })
  }
  opciones.push({ id: 'otro', titulo: 'Otro monto', monto: 0 })

  const coincide = montoInicial != null ? opciones.find((o) => o.id !== 'otro' && Math.abs(o.monto - montoInicial) < 0.01) : undefined
  const [opcion, setOpcion] = useState<Opcion>(montoInicial != null ? (coincide?.id ?? 'otro') : opciones[0].id)
  const [otro, setOtro] = useState(montoInicial != null && !coincide ? String(montoInicial) : '')
  const [origen, setOrigen] = useState(() => prefValida('pago:origen', debitos.map((d) => d.id)) ?? debitos[0]?.id ?? '')
  const [fecha, setFecha] = useState(() => toKey(new Date()))
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const elegido = opciones.find((o) => o.id === opcion)
  const monto = opcion === 'otro' ? (isMoneyInput(otro) ? moneyNum(otro) : 0) : elegido?.monto ?? 0

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!(monto > 0)) return setError('Escribe cuánto pagaste')
    if (!fecha || fecha > toKey(new Date())) return setError('Elige una fecha que no sea futura')
    const de = debitos.find((d) => d.id === origen) ?? null
    setGuardando(true)
    try {
      await pagar({
        card: { id: tarjeta.id, name: tarjeta.name },
        amount: monto,
        from: de ? { id: de.id, name: de.name } : null,
        date: fecha,
        nota,
      })
      guardarPref('pago:origen', origen || '')
      const resta = proximo ? Math.max(0, proximo.falta - monto) : 0
      toast.success(
        `Pagaste ${formatMXN(monto)} a ${tarjeta.name}`,
        proximo ? (resta > 0.005 ? `Te faltan ${formatMXN(resta)} para no generar intereses` : 'Estado de cuenta pagado') : de ? `Salió de ${de.name}` : '',
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo guardar el pago')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pagar ${tarjeta.name}`}
      footer={
        <div className="flex flex-col gap-2">
          {error && <p className="text-[12.5px] font-semibold text-debt-ink">• {error}</p>}
          <Button type="submit" form="pagar-tarjeta" loading={guardando} disabled={!(monto > 0)}>
            {monto > 0 ? `Pagar ${formatMXN(monto)}` : 'Pagar'}
          </Button>
        </div>
      }
    >
      <form id="pagar-tarjeta" onSubmit={(e) => void guardar(e)} className="flex flex-col gap-3" noValidate>
        {proximo ? (
          <div className="rounded-2xl bg-primary-soft/40 px-4 py-3">
            <p className="text-[12px] font-semibold text-primary-deep">
              Corte {fechaCorta(proximo.corte)} · vence {fechaCorta(proximo.vence)}
              {proximo.estado === 'vencido' ? ' · venció' : ''}
            </p>
            <p className="mt-0.5 text-[13px] text-text">
              Te falta <b className="font-mono">{formatMXN(proximo.falta)}</b> para no generar intereses
              {proximo.pagado > 0 ? ` (ya pagaste ${formatMXN(proximo.pagado)})` : ''}.
            </p>
            {onVerEstado && (
              <button type="button" onClick={onVerEstado} className="mt-1 min-h-[32px] text-[12.5px] font-bold text-primary-deep">
                Ver estado de cuenta
              </button>
            )}
          </div>
        ) : !estados ? (
          <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-[12.5px] text-text-secondary">
            Ahora no pude calcular tu estado de cuenta (revisa tu conexión). Puedes registrar el pago igual.
          </p>
        ) : estados.sinCorte ? (
          <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-[12.5px] text-text-secondary">
            Agrega el día de corte de {tarjeta.name} (en Cuentas → ajustes de la tarjeta) para saber cuánto te toca
            pagar. Mientras, puedes registrar cualquier pago.
          </p>
        ) : (
          <p className="rounded-2xl bg-asset-soft/60 px-4 py-3 text-[12.5px] text-asset-ink">
            No tienes nada pendiente en tu estado de cuenta. Puedes adelantar un pago.
          </p>
        )}

        <div role="radiogroup" aria-label="Cuánto pagas" className="flex flex-col gap-1.5">
          {opciones.map((o) => {
            const activa = o.id === opcion
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={activa}
                onClick={() => setOpcion(o.id)}
                className={clsx(
                  'flex min-h-[48px] items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition-colors',
                  activa ? 'border-primary bg-primary-soft/40' : 'border-border bg-bg-elevated',
                )}
              >
                <span
                  className={clsx(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2',
                    activa ? 'border-primary bg-primary text-white' : 'border-border',
                  )}
                  aria-hidden
                >
                  {activa && <IconCheck size={11} stroke={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-text">{o.titulo}</span>
                  {o.nota && <span className="block text-[11.5px] text-text-secondary">{o.nota}</span>}
                </span>
                {o.id !== 'otro' && <span className="font-mono text-[13px] font-bold tabular-nums text-text">{formatMXN(o.monto)}</span>}
              </button>
            )
          })}
        </div>

        {opcion === 'otro' && (
          <Input
            label="Monto"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            autoFocus
            value={otro}
            onChange={(e) => setOtro(e.target.value)}
          />
        )}

        <Select label="¿De dónde sale el dinero?" value={origen} onChange={(e) => setOrigen(e.target.value)}>
          {debitos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {formatMXN(Number(d.balance) || 0)}
            </option>
          ))}
          <option value="">No registrar de dónde salió</option>
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha"
            type="date"
            max={toKey(new Date())}
            className="w-full min-w-0"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <Input label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>

        <p className="text-[11.5px] leading-snug text-text-secondary">
          Un pago no es ingreso ni gasto: baja la deuda de {tarjeta.name}
          {origen ? ' y el saldo de la cuenta de la que sale' : ''}.
        </p>
        {proximo && proximo.ajustesAlAlza > 0 && !proximo.corregido && (
          <p className="text-[11.5px] leading-snug text-text-secondary">
            Subiste el saldo a mano después del corte ({formatMXN(proximo.ajustesAlAlza)}) y se tomó como compra nueva. Si
            era de antes del corte, la cifra para no generar intereses es mayor: revisa el estado de cuenta.
          </p>
        )}
      </form>
    </Modal>
  )
}
