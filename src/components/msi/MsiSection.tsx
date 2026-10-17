import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { IconCalendarEvent, IconChevronRight, IconPlus, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { InstallmentCard } from '@/components/InstallmentCard'
import { InstallmentFormModal } from '@/components/InstallmentFormModal'
import { InstallmentDetailModal } from '@/components/msi/InstallmentDetailModal'
import { MsiGapAlert } from '@/components/MsiGapAlert'
import { useHoy } from '@/hooks/useHoy'
import { useInstallments } from '@/hooks/useInstallments'
import { useToast } from '@/hooks/useToast'
import { proximoVencimiento } from '@/lib/cardCycle'
import { getMsiUncovered } from '@/lib/debt'
import { formatMXN } from '@/lib/format'
import { fromKey, toKey } from '@/lib/localDate'
import { fechaCorta } from '@/lib/movementDates'
import { cuentaEnSuFecha, type InstallmentVivo } from '@/lib/msi'
import { useUiStore } from '@/store/uiStore'
import type { Account } from '@/types'

const AVISO = 'fortnight:msi:aviso-pagos'

function avisoVisto(): boolean {
  try {
    return window.localStorage.getItem(AVISO) === '1'
  } catch {
    return true
  }
}

interface MsiSectionProps {
  accounts: Account[]
  updateBalance: (account: Account, nuevoSaldo: number) => Promise<void>
}

/**
 * «Meses sin intereses» en Cuentas: los planes agrupados por tarjeta, cada
 * grupo con lo que trae su estado de cuenta, y el detalle mes por mes al tocar
 * un plan (también abre con `?msi=<id>`, desde el calendario o Movimientos).
 */
export function MsiSection({ accounts, updateBalance }: MsiSectionProps) {
  const { data: planes, create, update, marcarMes, liquidar, remove, movsTarjetas } = useInstallments()
  const hoy = useHoy()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<InstallmentVivo | null>(null)
  const [verTerminados, setVerTerminados] = useState(false)
  const [avisoCerrado, setAvisoCerrado] = useState(avisoVisto)
  const abrirPago = useUiStore((s) => s.abrirPago)

  const credit = accounts.filter((a) => a.type === 'credit')
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const abiertoId = params.get('msi')
  const abierto = abiertoId ? planes.find((p) => p.id === abiertoId) ?? null : null

  function abrir(id: string) {
    const p = new URLSearchParams(params)
    p.set('msi', id)
    setParams(p, { replace: false })
  }
  function cerrar() {
    const p = new URLSearchParams(params)
    p.delete('msi')
    setParams(p, { replace: true })
  }
  function cerrarAviso() {
    setAvisoCerrado(true)
    try {
      window.localStorage.setItem(AVISO, '1')
    } catch {
      // sin almacenamiento, el aviso vuelve a salir: no pasa nada
    }
  }

  const activos = planes.filter((p) => !p.msi.terminado)
  const terminados = planes.filter((p) => p.msi.terminado)
  const totalRestante = activos.reduce((s, p) => s + p.msi.restante, 0)
  const totalMensual = activos.reduce((s, p) => s + (p.msi.actual?.monto ?? 0), 0)

  // Grupos: cada tarjeta con sus planes; al final, los que no tienen tarjeta.
  const grupos: { cuenta: Account | null; planes: InstallmentVivo[] }[] = []
  for (const c of credit) {
    const suyos = activos.filter((p) => p.account_id === c.id)
    if (suyos.length) grupos.push({ cuenta: c, planes: suyos })
  }
  const sueltos = activos.filter((p) => !p.account_id || !accountById.has(p.account_id))
  if (sueltos.length) grupos.push({ cuenta: null, planes: sueltos })

  const notificar = (p: Promise<unknown>, ok?: [string, string]) =>
    p.then(() => ok && toast.success(...ok)).catch((e: unknown) => {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : 'Inténtalo de nuevo')
      throw e
    })

  return (
    <section id="tour-cuentas-msi" className="px-4 pb-2 pt-2">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Meses sin intereses</h2>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex min-h-[32px] items-center gap-1 rounded-full bg-primary-soft px-3 text-[12px] font-bold text-primary-deep transition-colors active:scale-95"
        >
          <IconPlus size={13} stroke={2.5} /> Agregar
        </button>
      </div>

      {planes.length === 0 ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
        >
          <IconCalendarEvent size={15} />
          Registrar compra a meses
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {!avisoCerrado && activos.some((p) => p.account_id && accountById.has(p.account_id)) && (
            <div className="flex items-start gap-2 rounded-xl bg-lavender-soft/50 px-3.5 py-2.5">
              <p className="flex-1 text-[12.5px] leading-snug text-text">
                Tus MSI ahora se marcan con tus pagos: una mensualidad queda pagada cuando lo que pagaste a la tarjeta
                la cubre, no sólo porque pasó la fecha. Toca un plan para ver el porqué de cada mes.
              </p>
              <button type="button" onClick={cerrarAviso} aria-label="Entendido" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-secondary">
                <IconX size={15} />
              </button>
            </div>
          )}

          {activos.length > 0 && (
            <div className="flex items-stretch gap-2 rounded-xl bg-primary-soft/25 px-3.5 py-3">
              <div className="flex-1">
                <p className="text-[11px] font-bold text-primary-deep">Por pagar</p>
                <p className="mt-0.5 font-mono text-[15px] font-extrabold text-primary-deep">{formatMXN(totalRestante)}</p>
              </div>
              <div className="w-px bg-primary/15" />
              <div className="flex-1 pl-3">
                <p className="text-[11px] font-bold text-primary-deep">Este mes</p>
                <p className="mt-0.5 font-mono text-[15px] font-extrabold text-primary-deep">{formatMXN(totalMensual)}</p>
              </div>
            </div>
          )}

          {/* Una tarjeta cuyo saldo no alcanza para lo que aún no se cobra. */}
          {credit
            .map((a) => ({ account: a, gap: getMsiUncovered(a, planes, hoy) }))
            .filter(({ gap }) => gap > 0.005)
            .map(({ account, gap }) => (
              <MsiGapAlert
                key={account.id}
                account={account}
                gap={gap}
                onAgregar={async (nuevoSaldo) => {
                  await updateBalance(account, nuevoSaldo)
                  toast.success('Saldo actualizado', `${account.name} quedó en ${formatMXN(nuevoSaldo)}`)
                }}
              />
            ))}

          {grupos.map(({ cuenta, planes: suyos }) => (
            <div key={cuenta?.id ?? 'sin-tarjeta'} className="flex flex-col gap-1.5">
              <EncabezadoTarjeta cuenta={cuenta} planes={suyos} hoy={hoy} />
              {suyos.map((p) => (
                <InstallmentCard
                  key={p.id}
                  installment={p}
                  linkedAccount={cuenta ?? undefined}
                  onOpen={() => abrir(p.id)}
                  onPagarTarjeta={cuenta ? () => abrirPago(cuenta.id) : undefined}
                  onPagarActual={() =>
                    void notificar(marcarMes(p.id, p.msi.actual!.n, 'paid'), [
                      'Mensualidad pagada',
                      `${p.name} · ${p.msi.actual!.n} de ${p.msi.meses.length}`,
                    ]).catch(() => {})
                  }
                />
              ))}
            </div>
          ))}

          {terminados.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setVerTerminados((v) => !v)}
                aria-expanded={verTerminados}
                className="flex min-h-[40px] w-full items-center justify-between px-1 text-[12.5px] font-bold text-text-secondary"
              >
                Terminados ({terminados.length})
                <IconChevronRight size={15} className={clsx('transition-transform motion-reduce:transition-none', verTerminados && 'rotate-90')} />
              </button>
              {verTerminados && (
                <div className="flex flex-col gap-1.5">
                  {terminados.map((p) => (
                    <InstallmentCard
                      key={p.id}
                      installment={p}
                      linkedAccount={p.account_id ? accountById.get(p.account_id) : undefined}
                      onOpen={() => abrir(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {abierto && !editando && (
        <InstallmentDetailModal
          key={abierto.id}
          installment={abierto}
          linkedAccount={abierto.account_id ? accountById.get(abierto.account_id) : undefined}
          hoy={hoy}
          onClose={cerrar}
          onEdit={() => setEditando(abierto)}
          onMarcarMes={(n, e) => notificar(marcarMes(abierto.id, n, e))}
          onPagarTarjeta={
            abierto.account_id && accountById.get(abierto.account_id)?.type === 'credit'
              ? () => {
                  // El pago se abre solo; al volver, la lista ya dice qué cubrió.
                  cerrar()
                  abrirPago(abierto.account_id!)
                }
              : undefined
          }
          onCambiarFechaDeCompra={(fecha) =>
            notificar(update(abierto.id, { start_date: fecha }), ['Fecha de compra actualizada', fechaCorta(fecha)])
          }
          onLiquidar={async (restar) => {
            const monto = abierto.msi.restante
            const cuenta = abierto.account_id ? accountById.get(abierto.account_id) : undefined
            await notificar(liquidar(abierto.id), ['Plan liquidado', abierto.name])
            if (restar && cuenta) await updateBalance(cuenta, Math.round((Number(cuenta.balance) - monto) * 100) / 100)
          }}
          onEliminar={async (quitarCargo) => {
            await notificar(remove(abierto.id, { quitarCargo }), ['Plan eliminado', abierto.name])
            cerrar()
          }}
        />
      )}

      <InstallmentFormModal
        open={formOpen || editando != null}
        onClose={() => {
          setFormOpen(false)
          setEditando(null)
        }}
        onSubmit={create}
        editingInstallment={editando ?? undefined}
        onUpdate={update}
        movimientos={movsTarjetas}
      />
    </section>
  )
}

/** El estado de cuenta actual de una tarjeta, en lo que toca a sus MSI. */
function EncabezadoTarjeta({ cuenta, planes, hoy }: { cuenta: Account | null; planes: InstallmentVivo[]; hoy: string }) {
  if (!cuenta) {
    return <p className="px-1 text-[12px] font-bold text-text-secondary">Sin tarjeta</p>
  }
  const prox = proximoVencimiento(cuenta, fromKey(hoy))
  const vence = prox ? toKey(prox.vence) : null
  const delPago = vence
    ? planes.flatMap((p) => p.msi.meses).filter((m) => m.estado === 'vencida' || (m.vence === vence && cuentaEnSuFecha(m))).reduce((s, m) => s + m.monto, 0)
    : 0
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-1">
      <p className="text-[12.5px] font-bold text-text">{cuenta.name}</p>
      <p className="text-[11.5px] text-text-secondary">
        {prox && vence ? (
          <>
            {prox.corte ? `Corte ${fechaCorta(toKey(prox.corte))} · ` : ''}vence {fechaCorta(vence)} ·{' '}
            <b className="font-mono text-text">{formatMXN(delPago)}</b> en mensualidades
          </>
        ) : (
          'Agrega su día de corte y de pago para ver sus fechas'
        )}
      </p>
    </div>
  )
}
