import { primerCorteDesde, corteMas, venceDelCorte, type CicloTarjeta } from '@/lib/cardCycle'
import { dayInMonth, fromKey, toKey } from '@/lib/localDate'
import type { Installment } from '@/types'

/**
 * Meses sin intereses con fecha.
 *
 * Antes, `months_paid` era un contador que se movía a mano («Marcar mes
 * pagado»). Nada lo avanzaba con el tiempo, la mensualidad 1 caía el día de la
 * compra y un plan terminado seguía sumando. Aquí cada mensualidad tiene fecha:
 * entra en un corte de la tarjeta y vence en la fecha de pago de ese estado de
 * cuenta. Cuando su fecha límite pasa, cuenta como pagada sola.
 *
 * El usuario puede corregir cualquier mes (`month_status`), y cada mes dice de
 * dónde sale su estado: automático, marcado a mano, o «anterior» (el progreso
 * que ya traía el contador viejo, para que nadie pierda lo que había marcado).
 *
 * Desde v1.18, en una tarjeta con estado de cuenta, una mensualidad la cubren
 * tus PAGOS, no la fecha: `cobertura` (calculada con el estado de cuenta) dice
 * si lo pagado alcanzó. Sin pagos, una mensualidad vencida queda «vencida».
 * Donde no hay estado de cuenta confiable, sigue mandando la fecha.
 *
 * Todo es puro y en días locales `YYYY-MM-DD`: se prueba sin reloj ni red.
 */

export type EstadoMes = 'pagada' | 'por-pagar' | 'vencida' | 'proxima'
export type OrigenMes = 'auto' | 'manual' | 'anterior'

export interface MarcaMes {
  s: 'paid' | 'unpaid'
  /** Día local en que se marcó; null = venía del contador anterior. */
  at: string | null
}

export interface MesMsi {
  n: number
  monto: number
  /** Corte en el que entra; null si el plan no tiene tarjeta con corte. */
  corte: string | null
  vence: string
  venceEstimado: boolean
  estado: EstadoMes
  origen: OrigenMes
  marcadaEl: string | null
  /** El estado lo decidieron tus pagos a la tarjeta, no la fecha. */
  porPagos: boolean
}

/**
 * ¿Lo que pagaste a la tarjeta alcanzó para la mensualidad `n`? `null` = no
 * hay estado de cuenta con qué saberlo: decide la fecha.
 */
export type CoberturaMsi = (n: number) => 'cubierta' | 'no-cubierta' | null

export interface CalendarioMsi {
  meses: MesMsi[]
  pagadas: number
  /** La mensualidad en curso: la primera sin pagar. */
  actual: MesMsi | null
  /** Lo que falta por pagar del plan. */
  restante: number
  /** Lo que todavía no entra a ningún corte. */
  porFacturar: number
  /** Ya está en un estado de cuenta (o vencido) y no se ha pagado. */
  enEstado: number
  terminado: boolean
  /** Fecha límite de la última mensualidad. */
  termina: string
  /** Mensualidades marcadas pagadas antes de que siquiera entraran a un corte. */
  adelantadas: number
}

/** Clave de versión dentro de `month_status`: nunca queda `{}` tras una edición. */
const VERSION = '_v'

const r2 = (n: number) => Math.round(n * 100) / 100

function num(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Día local de un timestamp ISO; sin fecha válida, null. */
function diaLocal(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : toKey(d)
}

export function fechaDeCompra(inst: Pick<Installment, 'start_date' | 'created_at'>, hoy: string): string {
  const s = inst.start_date ? String(inst.start_date).slice(0, 10) : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return diaLocal(inst.created_at) ?? hoy
}

/** Día local en que se registró el plan (para el cargo a la tarjeta). */
export function registradoEl(inst: Pick<Installment, 'created_at' | 'start_date'>, hoy: string): string {
  return diaLocal(inst.created_at) ?? fechaDeCompra(inst, hoy)
}

function mesesTotales(inst: Pick<Installment, 'months_total'>): number {
  return Math.max(1, Math.round(num(inst.months_total, 1)))
}

/** Monto de la mensualidad `n`. La última absorbe el redondeo: sin pagos, el restante es el total exacto. */
export function montoDeMes(inst: Pick<Installment, 'total_amount' | 'monthly_amount' | 'months_total'>, n: number): number {
  const M = mesesTotales(inst)
  const total = num(inst.total_amount)
  const mensual = num(inst.monthly_amount) || r2(total / M)
  if (n < M) return mensual
  return Math.max(0, r2(total - mensual * (M - 1)))
}

/**
 * Las marcas que valen para este plan. Sin marcas guardadas, los meses
 * 1..`months_paid` cuentan como pagados («anterior»): es el progreso que el
 * usuario llevaba con el contador viejo.
 */
export function marcasEfectivas(inst: Pick<Installment, 'month_status' | 'months_paid' | 'months_total'> & { status?: Installment['status'] }): Record<number, MarcaMes> {
  const out: Record<number, MarcaMes> = {}
  const M = mesesTotales(inst)
  const crudo = inst.month_status
  const guardadas = crudo && typeof crudo === 'object' ? Object.keys(crudo) : []
  if (guardadas.length > 0) {
    for (const k of guardadas) {
      const n = Number(k)
      if (!Number.isInteger(n) || n < 1 || n > M) continue
      const v = (crudo as Record<string, unknown>)[k] as { s?: unknown; at?: unknown } | null
      if (!v || (v.s !== 'paid' && v.s !== 'unpaid')) continue
      out[n] = { s: v.s, at: typeof v.at === 'string' ? v.at : null }
    }
    return out
  }
  // Un plan marcado «pagado» con el contador viejo está pagado completo.
  const previas = inst.status === 'paid' ? M : Math.min(M, Math.max(0, Math.round(num(inst.months_paid))))
  for (let n = 1; n <= previas; n++) out[n] = { s: 'paid', at: null }
  return out
}

interface Fechas {
  corte: string | null
  vence: string
  estimado: boolean
  /** Desde cuándo la mensualidad «ya está cobrada»: el corte, o un mes antes de vencer. */
  desde: string
}

function fechasDeMes(compra: string, ciclo: CicloTarjeta | null, offset: number, n: number): Fechas {
  const c = fromKey(compra)
  const conCorte = ciclo && ciclo.type === 'credit' ? primerCorteDesde(ciclo, c) : null
  if (ciclo && conCorte) {
    const corte = corteMas(ciclo, conCorte, offset + n - 1)!
    const { vence, estimado } = venceDelCorte(ciclo, corte)
    return { corte: toKey(corte), vence: toKey(vence), estimado, desde: toKey(corte) }
  }
  // Tarjeta sin día de corte pero con día de pago: las mensualidades caen en
  // sus fechas de pago (desde el mes siguiente a la compra), para que el pago
  // de la tarjeta las lleve. Sin corte, la fecha es aproximada.
  const diaPago = ciclo && ciclo.type === 'credit' && ciclo.payment_grace_days == null ? Number(ciclo.payment_due_day) : NaN
  if (Number.isInteger(diaPago) && diaPago >= 1 && diaPago <= 31) {
    const vence = dayInMonth(c.getFullYear(), c.getMonth() + offset + n, diaPago)
    const desde = dayInMonth(c.getFullYear(), c.getMonth() + offset + n - 1, diaPago)
    return { corte: null, vence: toKey(vence), estimado: true, desde: toKey(desde) }
  }
  const vence = dayInMonth(c.getFullYear(), c.getMonth() + offset + n, c.getDate())
  const desde = dayInMonth(c.getFullYear(), c.getMonth() + offset + n - 1, c.getDate())
  return { corte: null, vence: toKey(vence), estimado: false, desde: toKey(desde) }
}

type PlanMsi = Pick<
  Installment,
  'total_amount' | 'monthly_amount' | 'months_total' | 'months_paid' | 'start_date' | 'created_at' | 'month_status' | 'billing_offset'
> & { status?: Installment['status'] }

export function calendarioMsi(
  inst: PlanMsi,
  ciclo: CicloTarjeta | null,
  hoy: string,
  cobertura?: CoberturaMsi,
): CalendarioMsi {
  const M = mesesTotales(inst)
  const compra = fechaDeCompra(inst, hoy)
  const offset = Math.min(12, Math.max(0, Math.round(num(inst.billing_offset))))
  const marcas = marcasEfectivas(inst)

  const meses: MesMsi[] = []
  for (let n = 1; n <= M; n++) {
    const f = fechasDeMes(compra, ciclo, offset, n)
    const marca = marcas[n]
    // Una marca a mano gana siempre; sin ella, los pagos (si se saben) y luego la fecha.
    const cob = marca ? null : (cobertura?.(n) ?? null)
    let estado: EstadoMes
    let origen: OrigenMes = 'auto'
    let marcadaEl: string | null = null
    if (marca?.s === 'paid') {
      estado = 'pagada'
      origen = marca.at == null ? 'anterior' : 'manual'
      marcadaEl = marca.at
    } else if (marca?.s === 'unpaid') {
      // «No la pagué»: vencida si ya pasó su fecha; si no, sigue por pagar.
      estado = f.vence < hoy ? 'vencida' : f.desde <= hoy ? 'por-pagar' : 'proxima'
      origen = 'manual'
      marcadaEl = marca.at
    } else if (cob === 'cubierta') {
      estado = 'pagada'
    } else if (f.vence < hoy) {
      estado = cob === 'no-cubierta' ? 'vencida' : 'pagada'
    } else if (f.desde <= hoy) {
      estado = 'por-pagar'
    } else {
      estado = 'proxima'
    }
    meses.push({
      n,
      monto: montoDeMes(inst, n),
      corte: f.corte,
      vence: f.vence,
      venceEstimado: f.estimado,
      estado,
      origen,
      marcadaEl,
      porPagos: cob != null,
    })
  }

  const pendientes = meses.filter((m) => m.estado !== 'pagada')
  const restante = r2(pendientes.reduce((s, m) => s + m.monto, 0))
  const porFacturar = r2(meses.filter((m) => m.estado === 'proxima').reduce((s, m) => s + m.monto, 0))
  const pagadas = M - pendientes.length
  const adelantadas = meses.filter((m, i) => {
    if (m.estado !== 'pagada' || m.origen === 'auto') return false
    return fechasDeMes(compra, ciclo, offset, i + 1).desde > hoy
  }).length

  return {
    meses,
    pagadas,
    actual: pendientes[0] ?? null,
    restante,
    porFacturar,
    enEstado: r2(restante - porFacturar),
    terminado: pendientes.length === 0,
    termina: meses[M - 1].vence,
    adelantadas,
  }
}

/* ── Escrituras: siempre devuelven el objeto completo a guardar ──────────── */

function guardable(marcas: Record<number, MarcaMes>): Record<string, unknown> {
  const out: Record<string, unknown> = { [VERSION]: 2 }
  for (const [n, m] of Object.entries(marcas)) out[n] = { s: m.s, at: m.at }
  return out
}

/**
 * Las marcas del plan, listas para guardar. Se escriben en TODA edición: si un
 * plan viejo se guardara con `month_status` vacío y `months_paid` ya con los
 * meses automáticos, la siguiente lectura los tomaría como marcados a mano.
 */
export function marcasGuardables(inst: PlanMsi, nuevoTotal?: number): Record<string, unknown> {
  return guardable(marcasEfectivas(nuevoTotal != null ? { ...inst, months_total: nuevoTotal } : inst))
}

/** Marca (o desmarca) una mensualidad. `'auto'` la regresa a lo que digan las fechas. */
export function conMarca(inst: PlanMsi, n: number, e: 'paid' | 'unpaid' | 'auto', hoy: string): Record<string, unknown> {
  const marcas = { ...marcasEfectivas(inst) }
  if (e === 'auto') delete marcas[n]
  else marcas[n] = { s: e, at: hoy }
  return guardable(marcas)
}

/**
 * «Liquidar el resto»: todas las que faltan quedan pagadas hoy. Con la
 * cobertura, también las que tus pagos no alcanzaron: sin ella, al dejar de
 * saberse los pagos volverían a salir vencidas.
 */
export function liquidarMarcas(inst: PlanMsi, ciclo: CicloTarjeta | null, hoy: string, cobertura?: CoberturaMsi): Record<string, unknown> {
  const marcas = { ...marcasEfectivas(inst) }
  for (const m of calendarioMsi(inst, ciclo, hoy, cobertura).meses) {
    if (m.estado !== 'pagada') marcas[m.n] = { s: 'paid', at: hoy }
  }
  return guardable(marcas)
}

/**
 * Lo que el plan debió cargar a la tarjeta el día que se registró: el total,
 * menos las mensualidades que para entonces ya habían vencido (esas se pagaron
 * con estados de cuenta anteriores, que ya estaban en el saldo).
 */
export function cargoObjetivo(inst: PlanMsi, ciclo: CicloTarjeta | null, alDia: string): number {
  const sinMarcas = { ...inst, month_status: { [VERSION]: 2 } }
  const cal = calendarioMsi(sinMarcas, ciclo, alDia)
  const vencidas = cal.meses.filter((m) => m.vence < alDia).reduce((s, m) => s + m.monto, 0)
  return Math.max(0, r2(num(inst.total_amount) - vencidas))
}

/**
 * El cargo después de editar el plan. Se ajusta por DIFERENCIA y no se
 * recalcula de cero: los pagos a la tarjeta ya bajaron el saldo, y recalcular
 * desde los meses pagados los restaba dos veces.
 */
export function nuevoCargo(
  actual: number,
  antes: [PlanMsi, CicloTarjeta | null],
  despues: [PlanMsi, CicloTarjeta | null],
  registrado: string,
): number {
  const delta = cargoObjetivo(despues[0], despues[1], registrado) - cargoObjetivo(antes[0], antes[1], registrado)
  return Math.max(0, r2(num(actual) + delta))
}

/**
 * Los planes viejos guardaron como «inicio» el día en que se registraron, no el
 * de la compra. Si hay mensualidades marcadas pagadas antes de entrar a un
 * corte, propone una fecha de compra que las haga cuadrar.
 */
export function sugerirFechaDeCompra(inst: PlanMsi, ciclo: CicloTarjeta | null, hoy: string): string | null {
  const { adelantadas } = calendarioMsi(inst, ciclo, hoy)
  if (adelantadas === 0) return null
  const c = fromKey(fechaDeCompra(inst, hoy))
  const propuesta = toKey(dayInMonth(c.getFullYear(), c.getMonth() - adelantadas, c.getDate()))
  return propuesta < hoy ? propuesta : null
}

/** Copia de compatibilidad para `months_paid`/`status` (versiones viejas en caché). */
export function copiaContador(cal: CalendarioMsi): { months_paid: number; status: 'active' | 'paid' } {
  return { months_paid: cal.pagadas, status: cal.terminado ? 'paid' : 'active' }
}

/* ── Planes «vivos»: la fila con su calendario ya calculado ─────────────── */

export interface CargoMsi {
  id: string
  amount: number
  account_id: string
  date: string
  /**
   * Un gasto que ya estaba registrado y se convirtió a meses («Fue a meses»):
   * es la compra completa, en su fecha, y vive desde antes que el plan.
   */
  adoptado?: boolean
}

/** ¿El movimiento existía antes que el plan? Entonces se adoptó (se convirtió), no se cargó. */
export function esAdoptado(tx: { created_at?: string | null }, plan: { created_at?: string | null }): boolean {
  if (!tx.created_at || !plan.created_at) return false
  const a = Date.parse(tx.created_at)
  const b = Date.parse(plan.created_at)
  return Number.isFinite(a) && Number.isFinite(b) && a < b
}

/**
 * Un plan con su calendario. `months_paid` y `status` se SOBRESCRIBEN con lo
 * que dicen las fechas, así cada pantalla que ya los leía (Resumen, Proyección,
 * el disponible) ve el avance real sin cambiar su lógica.
 */
export interface InstallmentVivo extends Installment {
  msi: CalendarioMsi
  ciclo: CicloTarjeta | null
  cargo: CargoMsi | null
}

export function vivo(
  inst: Installment,
  ciclo: CicloTarjeta | null,
  hoy: string,
  cargo: CargoMsi | null = null,
  cobertura?: CoberturaMsi,
): InstallmentVivo {
  const cal = calendarioMsi(inst, ciclo, hoy, cobertura)
  // `months_paid` se sobrescribe con lo que dicen las fechas, así que las marcas
  // se guardan ya resueltas: recalcular sobre el plan vivo no confunde los
  // meses automáticos con marcas «anteriores».
  return { ...inst, month_status: marcasGuardables(inst), ...copiaContador(cal), msi: cal, ciclo, cargo }
}

/** El calendario de un plan, ya calculado si viene «vivo». */
export function calendarioDe(inst: Installment & { msi?: CalendarioMsi }, ciclo: CicloTarjeta | null, hoy: string): CalendarioMsi {
  return inst.msi ?? calendarioMsi(inst, ciclo, hoy)
}

/** ¿Este mes sigue debiéndose en su fecha? Las pagadas a mano antes de tiempo, no. */
export function cuentaEnSuFecha(m: MesMsi): boolean {
  return !(m.estado === 'pagada' && m.origen !== 'auto')
}
