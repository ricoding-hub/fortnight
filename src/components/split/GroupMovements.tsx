import { createElement, memo, useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { IconCheck, IconChevronRight, IconClock, IconReceipt, IconSearch, IconTrash, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { categoryColor, categoryIcon } from '@/lib/categories'
import { formatMXN } from '@/lib/format'
import {
  agruparPorDia,
  filtrarMovimientos,
  resumirMovimientos,
  type FiltroMovimientos,
  type MovimientoDeGrupo,
} from '@/lib/groupMovements'
import { etiquetaDia, fechaCorta } from '@/lib/movementDates'
import type { Category, SplitExpense, SplitSettlement } from '@/types'

const FILTROS: { id: FiltroMovimientos; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'te-deben', etiqueta: 'Te deben' },
  { id: 'debes', etiqueta: 'Debes' },
  { id: 'saldados', etiqueta: 'Saldados' },
]

interface GroupMovementsProps {
  /** La lista ya construida (gastos + liquidaciones, cronológica). */
  movimientos: readonly MovimientoDeGrupo[]
  /** Si el contacto 1:1 o el grupo. Cambia sólo el texto. */
  isDirect: boolean
  categoriasPorId: ReadonlyMap<string, Category>
  nombreDeMiembro: (memberId: string) => string
  /** Quién agregó el gasto (null si fuiste tú: no se etiqueta lo propio). */
  creador: (userId: string) => { nombre: string; avatarUrl: string | null } | null
  /** Para decir «Pagaste tú» en lugar de tu nombre. */
  miMiembroId: string | undefined
  onAbrirGasto: (e: SplitExpense) => void
  onEliminarLiquidacion: (s: SplitSettlement) => void
  onAgregarGasto: () => void
  /** Préstamos privados / saldados: se pintan debajo y se ocultan al buscar. */
  extra?: ReactNode
}

/**
 * «Movimientos»: una lista cronológica agrupada por día, con buscador y chips.
 *
 * El buscador y los chips son lo que faltaba para responder «¿cuánto es *esto*?»
 * — «wings», «lo de septiembre», «$270» — sin sumar a mano. Con búsqueda o
 * filtro activo una línea resume lo que se ve, con signo.
 */
export function GroupMovements({
  movimientos,
  isDirect,
  categoriasPorId,
  nombreDeMiembro,
  creador,
  miMiembroId,
  onAbrirGasto,
  onEliminarLiquidacion,
  onAgregarGasto,
  extra,
}: GroupMovementsProps) {
  const [consulta, setConsulta] = useState('')
  const [filtro, setFiltro] = useState<FiltroMovimientos>('todos')
  // El campo responde al instante; la lista se recalcula con prioridad baja.
  // Sin esto, cada tecla re-renderizaba toda la lista en el mismo frame.
  const consultaDiferida = useDeferredValue(consulta)

  const visibles = useMemo(
    () => filtrarMovimientos(movimientos, filtro, consultaDiferida),
    [movimientos, filtro, consultaDiferida],
  )
  const dias = useMemo(() => agruparPorDia(visibles), [visibles])
  const resumen = useMemo(() => resumirMovimientos(visibles, filtro), [visibles, filtro])
  const cuentas = useMemo(
    () => ({
      todos: movimientos.length,
      'te-deben': filtrarMovimientos(movimientos, 'te-deben', '').length,
      debes: filtrarMovimientos(movimientos, 'debes', '').length,
      saldados: filtrarMovimientos(movimientos, 'saldados', '').length,
    }),
    [movimientos],
  )
  const gastosSaldados = useMemo(
    () => new Set(movimientos.filter((m) => m.kind === 'expense' && m.saldado).map((m) => m.id)),
    [movimientos],
  )

  const activo = filtro !== 'todos' || consulta.trim() !== ''
  const hayMovimientos = movimientos.length > 0
  const limpiar = () => {
    setConsulta('')
    setFiltro('todos')
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-text-secondary">
          Movimientos
        </h2>
        <button
          type="button"
          onClick={onAgregarGasto}
          className="rounded-full px-2.5 py-1.5 text-[12px] font-bold text-primary-deep transition-colors hover:bg-primary/8 active:scale-95"
        >
          + Gasto
        </button>
      </div>

      {hayMovimientos && (
        <>
          <div className="relative">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar gasto, persona o monto…"
              aria-label="Buscar movimientos"
              enterKeyHint="search"
              autoComplete="off"
              // text-base (16px): con menos, iOS Safari amplía la página al enfocar.
              className="h-11 w-full rounded-xl border border-border bg-bg-elevated pl-10 pr-10 text-base text-text placeholder:text-text-secondary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {consulta && (
              <button
                type="button"
                onClick={() => setConsulta('')}
                aria-label="Borrar búsqueda"
                className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-text-secondary transition-colors hover:bg-bg-secondary"
              >
                <IconX size={15} />
              </button>
            )}
          </div>

          {/* flex-wrap y no una fila con scroll horizontal: son cuatro chips cortos,
              y una fila que se desplaza es exactamente lo que dejó atrapadas las
              categorías dentro de un modal. */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar movimientos">
            {FILTROS.map((f) => {
              const on = filtro === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFiltro(f.id)}
                  className={clsx(
                    'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition-colors active:scale-95',
                    on
                      ? 'bg-primary-deep text-white'
                      : 'bg-bg-elevated text-text-secondary shadow-card hover:text-text',
                  )}
                >
                  {f.etiqueta}
                  <span className={clsx('font-mono text-[11px] tabular-nums', on ? 'text-white/80' : 'text-text-secondary')}>
                    {cuentas[f.id]}
                  </span>
                </button>
              )
            })}
          </div>

          {activo && (
            <p className="px-0.5 text-[12.5px] text-text-secondary" aria-live="polite">
              {resumen.cuenta} movimiento{resumen.cuenta === 1 ? '' : 's'}
              {resumen.cuenta > 0 && Math.abs(resumen.total) >= 0.005 && (
                <>
                  {' · '}
                  <span className={clsx('font-bold', resumen.total > 0 ? 'text-asset-ink' : 'text-debt-ink')}>
                    {resumen.total > 0 ? 'te deben' : 'debes'} {formatMXN(Math.abs(resumen.total))}
                  </span>
                </>
              )}
            </p>
          )}
        </>
      )}

      {!hayMovimientos && !extra ? (
        <EmptyState
          icon={IconReceipt}
          title="Sin gastos aún"
          description={`Registra el primer gasto compartido de esta ${isDirect ? 'conexión' : 'grupo'}.`}
        />
      ) : visibles.length === 0 && hayMovimientos ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="text-[13.5px] font-bold text-text">Nada coincide</p>
          <p className="text-[12.5px] text-text-secondary">
            {consulta.trim() ? `No hay movimientos con «${consulta.trim()}».` : 'No hay movimientos en este filtro.'}
          </p>
          <button
            type="button"
            onClick={limpiar}
            className="mt-1 rounded-full bg-primary-soft/60 px-4 py-2 text-[12.5px] font-bold text-primary-deep"
          >
            Limpiar filtros
          </button>
        </Card>
      ) : (
        <Card className="px-4 pb-1 pt-0">
          {dias.map((d) => (
            <section key={d.dia}>
              <h3 className="pb-0.5 pt-3 text-[11.5px] font-extrabold uppercase tracking-wider text-text-secondary">
                {etiquetaDia(d.dia)}
              </h3>
              <ul className="divide-y divide-border">
                {d.items.map((m) =>
                  m.kind === 'expense' && m.expense ? (
                    <FilaGasto
                      key={m.id}
                      m={m}
                      categoria={m.expense.category_id ? categoriasPorId.get(m.expense.category_id) ?? null : null}
                      pagador={m.expense.paid_by_member_id === miMiembroId ? 'Pagaste tú' : `Pagó ${nombreDeMiembro(m.expense.paid_by_member_id)}`}
                      creadorNombre={creador(m.expense.user_id)?.nombre ?? null}
                      creadorAvatar={creador(m.expense.user_id)?.avatarUrl ?? null}
                      onAbrir={onAbrirGasto}
                    />
                  ) : m.settlement ? (
                    <FilaLiquidacion
                      key={m.id}
                      m={m}
                      de={nombreDeMiembro(m.settlement.from_member_id)}
                      a={nombreDeMiembro(m.settlement.to_member_id)}
                      gasto={m.settlement.expense_id ? movimientos.find((x) => x.id === m.settlement!.expense_id)?.expense?.description ?? null : null}
                      neutra={!!m.settlement.expense_id && gastosSaldados.has(m.settlement.expense_id)}
                      onEliminar={onEliminarLiquidacion}
                    />
                  ) : null,
                )}
              </ul>
            </section>
          ))}
          {/* Los préstamos no se filtran con la búsqueda: se apartan mientras se
              busca para que el resultado sea sólo lo que se pidió. */}
          {!activo && extra}
        </Card>
      )}
    </div>
  )
}

/* ── Filas ────────────────────────────────────────────────────────────────── */

interface FilaGastoProps {
  m: MovimientoDeGrupo
  categoria: Category | null
  pagador: string
  creadorNombre: string | null
  creadorAvatar: string | null
  onAbrir: (e: SplitExpense) => void
}

/**
 * `memo`: con un grupo largo, escribir en el buscador re-renderizaba cada fila
 * en cada tecla. Las props son primitivas y referencias estables, así que sólo
 * se repinta la fila que de verdad cambió.
 */
const FilaGasto = memo(function FilaGasto({ m, categoria, pagador, creadorNombre, creadorAvatar, onAbrir }: FilaGastoProps) {
  const e = m.expense!
  const neto = m.neto
  const Icono = categoria ? categoryIcon(categoria) : IconReceipt

  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir(e)}
        className="flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left transition-colors active:bg-bg-secondary/60"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: categoria ? categoryColor(categoria) : 'var(--color-primary)' }}
        >
          {createElement(Icono, { size: 17, stroke: 2 })}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-text">{e.description}</span>
          <span className="block truncate text-[12px] text-text-secondary">{pagador}</span>
          {(creadorNombre || m.registrado) && (
            <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-secondary">
              {creadorNombre && (
                <>
                  <Avatar name={creadorNombre} avatarUrl={creadorAvatar} size={16} />
                  <span className="truncate font-semibold">Agregó {creadorNombre}</span>
                </>
              )}
              {m.registrado && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-peach-soft px-1.5 py-px font-bold text-peach-ink">
                  <IconClock size={10} stroke={2.5} /> Registrado {fechaCorta(m.registrado)}
                </span>
              )}
            </span>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end">
          {m.saldado ? (
            <>
              <span className="flex items-center gap-0.5 text-[10px] font-extrabold uppercase tracking-wide text-asset-ink">
                <IconCheck size={11} stroke={3} /> Saldado
              </span>
              <span className="font-mono text-[14px] font-extrabold tabular-nums text-text-secondary line-through">
                {formatMXN(Math.abs(neto))}
              </span>
            </>
          ) : neto !== 0 ? (
            <>
              <span className={clsx('text-[10px] font-extrabold uppercase tracking-wide', neto > 0 ? 'text-asset-ink' : 'text-debt-ink')}>
                {neto > 0 ? 'Te deben' : 'Debes'}
              </span>
              <span className={clsx('font-mono text-[15px] font-extrabold tabular-nums', neto > 0 ? 'text-asset-ink' : 'text-debt-ink')}>
                {neto > 0 ? '+' : '−'}{formatMXN(Math.abs(neto))}
              </span>
            </>
          ) : (
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-text-secondary">No te toca</span>
          )}
          <span className="font-mono text-[11px] tabular-nums text-text-secondary">de {formatMXN(Number(e.amount))}</span>
        </span>
        <IconChevronRight size={15} className="shrink-0 text-text-secondary" />
      </button>
    </li>
  )
})

interface FilaLiquidacionProps {
  m: MovimientoDeGrupo
  de: string
  a: string
  /** Descripción del gasto que saldó, si lo hay. */
  gasto: string | null
  /** Saldó un gasto que ya quedó completo: su pago se pinta neutro. */
  neutra: boolean
  onEliminar: (s: SplitSettlement) => void
}

const FilaLiquidacion = memo(function FilaLiquidacion({ m, de, a, gasto, neutra, onEliminar }: FilaLiquidacionProps) {
  const s = m.settlement!
  const efecto = m.neto
  const bueno = efecto >= 0

  return (
    <li className="flex min-h-[56px] items-center gap-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-asset/10 text-asset-ink">
        <IconCheck size={16} stroke={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-text">{de} pagó a {a}</span>
        <span className="block truncate text-[12px] text-text-secondary">{gasto ? `Saldó: ${gasto}` : 'Liquidación'}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        {neutra ? (
          <>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-text-secondary">Saldó el gasto</span>
            <span className="font-mono text-[14px] font-extrabold tabular-nums text-text-secondary">{formatMXN(Math.abs(efecto))}</span>
          </>
        ) : (
          <>
            <span className={clsx('text-[10px] font-extrabold uppercase tracking-wide', bueno ? 'text-asset-ink' : 'text-debt-ink')}>
              {bueno ? 'Bajó tu deuda' : 'Bajó la suya'}
            </span>
            <span className={clsx('font-mono text-[15px] font-extrabold tabular-nums', bueno ? 'text-asset-ink' : 'text-debt-ink')}>
              {bueno ? '+' : '−'}{formatMXN(Math.abs(efecto))}
            </span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => onEliminar(s)}
        aria-label="Eliminar liquidación"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-debt/10 hover:text-debt"
      >
        <IconTrash size={15} />
      </button>
    </li>
  )
})
