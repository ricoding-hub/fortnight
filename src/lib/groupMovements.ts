import type { SplitExpense, SplitExpenseShare, SplitSettlement } from '@/types'
import { impactoLiquidacion, impactoPersonal, saldoDeGasto } from '@/lib/split'
import { construirTexto, coincide } from '@/lib/movementSearch'
import { diaLocal, registroDistinto, textoDeFecha } from '@/lib/movementDates'

/**
 * La lista de «Movimientos» de un grupo o conexión, ya lista para pintar.
 *
 * Antes la pantalla pintaba primero todos los gastos y después todas las
 * liquidaciones, sin un orden común, y cada fila decidía por su cuenta qué
 * número enseñar. Aquí se unifica: una sola lista cronológica, con el efecto
 * sobre TU saldo calculado en un único sitio.
 */

export type FiltroMovimientos = 'todos' | 'te-deben' | 'debes' | 'saldados'

export interface MovimientoDeGrupo {
  kind: 'expense' | 'settlement'
  id: string
  /** Día local `YYYY-MM-DD` con el que se ordena y se agrupa. */
  dia: string
  /** Marca de tiempo para desempatar dentro del mismo día. */
  orden: string
  /** Lo que mueve tu saldo: + te deben, − debes. Coincide con `memberNets`. */
  neto: number
  /** Lo que sigue sin saldar, con signo. 0 si ya está saldado. */
  pendiente: number
  /** Un gasto cuyo pago ya está completo. */
  saldado: boolean
  /** Día en que se registró, sólo si difiere del día del gasto. */
  registrado: string | null
  /** Lo buscable de la fila, ya normalizado. */
  texto: string
  expense?: SplitExpense
  settlement?: SplitSettlement
}

export interface EntradaMovimientos {
  expenses: readonly SplitExpense[]
  settlements: readonly SplitSettlement[]
  sharesByExpense: ReadonlyMap<string, readonly SplitExpenseShare[]>
  /** Tu `member.id` en el grupo. Sin él no hay impacto personal que calcular. */
  meId: string | null
  nombreDeMiembro: (memberId: string) => string
  nombreDeUsuario: (userId: string) => string | null
  categoria: (categoryId: string | null) => string | null
}

export function construirMovimientos(e: EntradaMovimientos): MovimientoDeGrupo[] {
  const porGasto = new Map<string, SplitSettlement[]>()
  for (const st of e.settlements) {
    if (!st.expense_id) continue
    porGasto.set(st.expense_id, [...(porGasto.get(st.expense_id) ?? []), st])
  }

  const out: MovimientoDeGrupo[] = []

  for (const ex of e.expenses) {
    const shares = e.sharesByExpense.get(ex.id) ?? []
    const yo = e.meId ? impactoPersonal(ex.amount, ex.paid_by_member_id, shares, e.meId) : null
    const saldo = e.meId
      ? saldoDeGasto(ex.amount, ex.paid_by_member_id, shares, e.meId, porGasto.get(ex.id) ?? [])
      : null
    const neto = yo?.neto ?? 0
    const saldado = !!yo && neto !== 0 && !!saldo && saldo.saldado > 0 && saldo.pendiente === 0
    const dia = diaLocal(ex.expense_date)
    const registro = registroDistinto(ex.expense_date, ex.created_at)
    out.push({
      kind: 'expense',
      id: ex.id,
      dia,
      orden: ex.created_at,
      neto,
      pendiente: saldado || neto === 0 ? 0 : Math.sign(neto) * (saldo?.pendiente ?? Math.abs(neto)),
      saldado,
      registrado: registro,
      texto: construirTexto(
        [
          ex.description,
          e.nombreDeMiembro(ex.paid_by_member_id),
          e.nombreDeUsuario(ex.user_id),
          e.categoria(ex.category_id),
          // Sin etiquetas de estado ("te deben", "pagaste tú", "saldado"): para eso
          // están los chips, y meterlas aquí hacía que buscar "gas" devolviera todo
          // lo que pagaste tú ("pa-gas-te").
        ],
        [ex.amount, ...(yo && yo.tuParte > 0 ? [yo.tuParte] : []), ...(neto !== 0 ? [neto] : [])],
        [textoDeFecha(dia), ...(registro ? [textoDeFecha(registro)] : [])],
      ),
      expense: ex,
    })
  }

  for (const st of e.settlements) {
    const dia = diaLocal(st.created_at)
    const gasto = st.expense_id ? e.expenses.find((x) => x.id === st.expense_id) : undefined
    out.push({
      kind: 'settlement',
      id: st.id,
      dia,
      orden: st.created_at,
      neto: e.meId ? impactoLiquidacion(st.amount, st.from_member_id, e.meId) : 0,
      pendiente: 0,
      saldado: true,
      registrado: null,
      texto: construirTexto(
        [
          'liquidacion',
          e.nombreDeMiembro(st.from_member_id),
          e.nombreDeMiembro(st.to_member_id),
          gasto?.description,
          st.note,
        ],
        [st.amount],
        [textoDeFecha(dia)],
      ),
      settlement: st,
    })
  }

  // Más reciente primero; dentro del mismo día, lo último que se registró.
  return out.sort((a, b) => (a.dia === b.dia ? b.orden.localeCompare(a.orden) : b.dia.localeCompare(a.dia)))
}

/** Aplica el chip activo y la búsqueda. */
export function filtrarMovimientos(
  items: readonly MovimientoDeGrupo[],
  filtro: FiltroMovimientos,
  consulta: string,
): MovimientoDeGrupo[] {
  return items.filter((m) => {
    if (filtro === 'te-deben' && !(m.kind === 'expense' && m.pendiente > 0)) return false
    if (filtro === 'debes' && !(m.kind === 'expense' && m.pendiente < 0)) return false
    if (filtro === 'saldados' && !(m.kind === 'settlement' || m.saldado)) return false
    return coincide(m.texto, consulta)
  })
}

export interface DiaDeMovimientos {
  dia: string
  items: MovimientoDeGrupo[]
}

/** Agrupa por día conservando el orden ya establecido. */
export function agruparPorDia(items: readonly MovimientoDeGrupo[]): DiaDeMovimientos[] {
  const out: DiaDeMovimientos[] = []
  for (const m of items) {
    const ultimo = out[out.length - 1]
    if (ultimo && ultimo.dia === m.dia) ultimo.items.push(m)
    else out.push({ dia: m.dia, items: [m] })
  }
  return out
}

export interface ResumenDeMovimientos {
  cuenta: number
  /** Suma con signo de lo que se ve. + te deben, − debes. */
  total: number
}

/**
 * Qué suma lo que se ve.
 *
 * Con «Te deben» o «Debes» se suma lo PENDIENTE, que es lo que alguien quiere
 * saber al filtrar así: cuánto falta cobrar o pagar. En cualquier otro caso se
 * suma el efecto sobre tu saldo, y con la lista completa y sin búsqueda eso da
 * exactamente tu saldo del encabezado — la propiedad que hace auditable la
 * pantalla.
 */
export function resumirMovimientos(
  items: readonly MovimientoDeGrupo[],
  filtro: FiltroMovimientos,
): ResumenDeMovimientos {
  const pendiente = filtro === 'te-deben' || filtro === 'debes'
  const total = items.reduce((n, m) => n + (pendiente ? m.pendiente : m.neto), 0)
  return { cuenta: items.length, total: Math.round(total * 100) / 100 }
}
