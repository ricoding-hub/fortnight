import type { Account, ScoreSnapshot } from '@/types'

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/* ------------------------------------------------------------------ */
/* Score V3 — dónde estás (posición) + qué hiciste en 30 días (avance)  */
/* ------------------------------------------------------------------ */

/**
 * Hasta v1.18 el score casi no se movía: el apego al presupuesto valía siempre
 * 0.5 (nadie lo pasaba), la tasa de ahorro 0.5 sin ingresos registrados — y 0
 * al registrar uno —, la racha casi siempre 1/21, y sólo la utilización
 * cambiaba (+0.03 por cada $1,000). El anillo además redondeaba a enteros.
 *
 * Ahora son dos partes:
 *
 *   posición ∈ [0,1]  = 0.35·utilización + 0.25·deuda vs. ingreso + 0.40·colchón
 *                       (las que no se pueden medir no cuentan y su peso se reparte)
 *   avance   ∈ [−1,1] = lo que bajó tu deuda y subió tu efectivo en 30 días,
 *                       medido con los movimientos (el saldo sólo cambia por ellos)
 *
 *   score = 1 + 7·posición + 1.5·avance, entre 1 y 10, con un decimal.
 *
 * Sin cambios en 30 días el avance es 0 y el score dice dónde estás. Pagar deuda
 * o juntar colchón lo sube semana a semana; endeudarte lo baja.
 */

export interface MovimientoScore {
  account_id: string
  amount: number | string
  date: string
}

export interface ScoreInput {
  accounts: Account[]
  /** Ingreso mensual neto (configurado). 0 = desconocido. */
  ingresoMensual?: number
  /** Gastos fijos al mes (renta, servicios, suscripciones). 0 = desconocido. */
  gastosFijosMensuales?: number
  /** Movimientos de las cuentas desde `desde` (inclusive), para el avance. */
  movimientos?: MovimientoScore[]
  /** Inicio de la ventana del avance (`YYYY-MM-DD`): hoy − 30 días. */
  desde?: string
}

export interface ScoreBreakdown {
  /** 1 − deuda/límite en tarjetas con límite. null = no aplica. */
  utilizacion: number | null
  /** 1 − deuda/(6 meses de ingreso). null = sin ingreso configurado. */
  deudaVsIngreso: number | null
  /** Efectivo vs. 3 meses de gastos fijos (o un mes de ingreso). */
  colchon: number
  posicion: number
  /** −1..1: lo que mejoraste (o empeoraste) en 30 días. */
  avance: number
  deudaHoy: number
  deudaHace30: number
  efectivoHoy: number
  efectivoHace30: number
}

export interface ScoreResult {
  score: number
  breakdown: ScoreBreakdown
}

const PESOS = { utilizacion: 0.35, deudaVsIngreso: 0.25, colchon: 0.4 } as const

/**
 * Lo que de verdad sale cada mes sin falta: gastos fijos con fecha,
 * suscripciones y mensualidades MSI. Sin nada de eso, la parte «necesidades»
 * del presupuesto (o el estimado del onboarding).
 */
export function gastosFijosDe(md: {
  fijosMonthly: number
  subsMonthly: number
  installmentsMonthly: number
  fixedMonthly: number
}): number {
  const conocidos = md.fijosMonthly + md.subsMonthly + md.installmentsMonthly
  return conocidos > 0 ? conocidos : Math.max(0, md.fixedMonthly)
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function calculateScore(input: ScoreInput): ScoreResult {
  const { accounts, ingresoMensual = 0, gastosFijosMensuales = 0, movimientos = [], desde } = input
  const credito = accounts.filter((a) => a.type === 'credit')
  const debito = accounts.filter((a) => a.type === 'debit')
  const tipoDe = new Map(accounts.map((a) => [a.id, a.type]))

  // Un saldo negativo en una tarjeta es dinero a tu favor, no deuda negativa.
  const deudaHoy = credito.reduce((s, a) => s + Math.max(0, num(a.balance)), 0)
  const efectivoHoy = debito.reduce((s, a) => s + num(a.balance), 0)

  // Utilización: sólo con las tarjetas que tienen límite (una sin límite no
  // debe contar como «al tope»: su deuda ya pesa en deuda vs. ingreso).
  const conLimite = credito.filter((a) => num(a.credit_limit) > 0)
  const limite = conLimite.reduce((s, a) => s + num(a.credit_limit), 0)
  const deudaConLimite = conLimite.reduce((s, a) => s + Math.max(0, num(a.balance)), 0)
  const utilizacion = limite > 0 ? 1 - clamp(deudaConLimite / limite, 0, 1) : null

  const deudaVsIngreso =
    ingresoMensual > 0 ? 1 - clamp(deudaHoy / (6 * ingresoMensual), 0, 1) : deudaHoy <= 0 ? 1 : null

  const baseColchon = gastosFijosMensuales > 0 ? 3 * gastosFijosMensuales : ingresoMensual > 0 ? ingresoMensual : 0
  const colchon =
    baseColchon > 0 ? clamp(efectivoHoy / baseColchon, 0, 1) : deudaHoy > 0 ? clamp(efectivoHoy / deudaHoy, 0, 1) : efectivoHoy > 0 ? 1 : 0

  const partes: [number, number][] = [[colchon, PESOS.colchon]]
  if (utilizacion != null) partes.push([utilizacion, PESOS.utilizacion])
  if (deudaVsIngreso != null) partes.push([deudaVsIngreso, PESOS.deudaVsIngreso])
  const pesoTotal = partes.reduce((s, [, w]) => s + w, 0)
  const posicion = partes.reduce((s, [v, w]) => s + v * w, 0) / pesoTotal

  // Avance: cómo estaban tu deuda y tu efectivo hace 30 días, deshaciendo los
  // movimientos (ajustes de saldo incluidos: es como más se actualiza).
  const porTarjeta = new Map<string, number>()
  let enDebito = 0
  for (const m of movimientos) {
    if (desde && m.date.slice(0, 10) < desde) continue
    const tipo = tipoDe.get(m.account_id)
    if (tipo === 'credit') porTarjeta.set(m.account_id, (porTarjeta.get(m.account_id) ?? 0) + num(m.amount))
    else if (tipo === 'debit') enDebito += num(m.amount)
  }
  // Tarjeta por tarjeta: un saldo a favor no es deuda ni hoy ni hace 30 días.
  // Sumando todo junto, pagar de más una tarjeta en 0 contaba como deuda bajada.
  const deudaHace30 = credito.reduce(
    (s, a) => s + Math.max(0, num(a.balance) - (porTarjeta.get(a.id) ?? 0)),
    0,
  )
  const efectivoHace30 = efectivoHoy - enDebito
  const base = Math.max(ingresoMensual, deudaHace30 * 0.25, 1000)
  const avance = clamp((4 * (deudaHace30 - deudaHoy) + 1.5 * (efectivoHoy - efectivoHace30)) / base, -1, 1)

  const score = Math.round(clamp(1 + 7 * posicion + 1.5 * avance, 1, 10) * 10) / 10
  return {
    score,
    breakdown: { utilizacion, deudaVsIngreso, colchon, posicion, avance, deudaHoy, deudaHace30, efectivoHoy, efectivoHace30 },
  }
}

/**
 * How much the score actually moved inside the current week: today's value
 * against the last snapshot taken before Monday.
 *
 * Home used to subtract the two ends of the sparkline, which spans 30 days, and
 * label the result "esta semana" — so a month of drift was reported as a week
 * of it. Returns null when there is nothing to compare against, so the UI can
 * drop the number instead of printing a "+0.0" that looks measured.
 *
 * `snapshots` arrives newest-first, the order `useScoreHistory` reads it in.
 */
export function weeklyScoreDelta(
  snapshots: ScoreSnapshot[],
  currentScore: number,
  weekStartKey: string,
): number | null {
  // Closest snapshot before the week opened: that is where the week started.
  let baseline = snapshots.find((s) => s.day < weekStartKey)

  // A brand-new user has no history before Monday. Fall back to the oldest
  // reading inside the week — less of a week, but honestly within it.
  if (!baseline) {
    for (const s of snapshots) if (s.day >= weekStartKey) baseline = s
  }
  if (!baseline) return null

  return Math.round((currentScore - Number(baseline.score)) * 10) / 10
}
