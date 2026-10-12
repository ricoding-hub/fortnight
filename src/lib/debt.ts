import { addMonths, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { calendarioDe, cuentaEnSuFecha, type CalendarioMsi } from '@/lib/msi'
import { proximoVencimiento } from '@/lib/cardCycle'
import { fromKey, toKey } from '@/lib/localDate'
import type { Account, Installment as InstallmentRow } from '@/types'

/**
 * Un plan, crudo o «vivo» (con su calendario). Las cuentas de abajo usan el
 * calendario por fechas (src/lib/msi.ts) cuando lo tienen o lo pueden calcular
 * con la tarjeta; si no, caen al contador `months_paid` de siempre.
 */
type Installment = InstallmentRow & { msi?: CalendarioMsi }

const hoyKey = () => toKey(new Date())

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommittedPoint {
  month: string
  msi: number
  revolving: number
  total: number
}

export interface ColchonPoint {
  month: string
  colchon: number
  committed: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// New columns (cost_type, apr, min_payment_pct, prepay_buffer) may arrive as
// undefined when PostgREST's schema cache hasn't refreshed yet after the
// migration. Numeric columns from Postgres may also arrive as strings via
// PostgREST. These helpers coerce safely so no computation ever yields NaN.

function safeNum(v: unknown, fallback = 0): number {
  // `Number(null)` is 0 and passes isFinite, so a null column used to swallow
  // the fallback. That silently zeroed the 1.5% minimum payment for every card
  // without an explicit min_payment_pct, under-reporting what's due.
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function costType(account: Account): 'con_costo' | 'sin_costo' {
  return account.cost_type ?? 'con_costo'
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/** Principal still owed on an installment plan. */
export function getInstallmentRemaining(inst: Installment): number {
  if (inst.msi) return inst.msi.restante
  const total = safeNum(inst.months_total)
  const paid = safeNum(inst.months_paid)
  const monthly = safeNum(inst.monthly_amount)
  return (total - paid) * monthly
}

/**
 * Revolving (interest-accruing) portion of a credit card balance.
 * = bank balance − Σ MSI principal pending for this account.
 * Result is clamped to ≥ 0: if MSI principal exceeds balance the card is in a
 * prepaid state which is captured by prepay_buffer instead.
 */
export function getRevolvingBalance(account: Account, installments: Installment[], hoy = hoyKey()): number {
  if (account.type !== 'credit') return 0
  const msiPrincipal = deLaTarjeta(account, installments, hoy).reduce((s, c) => s + c.restante, 0)
  return Math.max(0, safeNum(account.balance) - msiPrincipal)
}

/** Calendarios de los planes activos de esta tarjeta, con sus fechas de corte. */
function deLaTarjeta(account: Account, installments: Installment[], hoy: string): CalendarioMsi[] {
  return installments
    .filter((i) => i.account_id === account.id)
    .map((i) => calendarioDe(i, account, hoy))
    .filter((c) => !c.terminado)
}

/**
 * MSI principal that does NOT fit inside the card's balance.
 *
 * `getRevolvingBalance` assumes the principal is already part of
 * `accounts.balance` and subtracts it, flattening anything left over with
 * `Math.max(0, …)`. When that leftover is positive the two figures contradict
 * each other — a plan saying $2,976 is owed on a card saying $0 — and the
 * clamp was hiding it. This exposes the gap so the UI can say so out loud.
 */
export function getMsiUncovered(account: Account, installments: Installment[], hoy = hoyKey()): number {
  if (account.type !== 'credit') return 0
  // Sólo lo que aún NO entra a un corte: lo ya facturado se puede pagar antes de
  // la fecha límite, y eso bajaba el saldo y disparaba una alerta falsa.
  const sinFacturar = deLaTarjeta(account, installments, hoy).reduce((s, c) => s + c.porFacturar, 0)
  return Math.max(0, Math.round((sinFacturar - safeNum(account.balance)) * 100) / 100)
}

/**
 * Deuda «a la vista» de todas las tarjetas: el saldo menos el MSI que todavía
 * no se cobra, tarjeta por tarjeta. Los planes sin tarjeta suman sólo lo que ya
 * toca pagar. Antes se restaba todo el capital MSI (incluidos los planes sin
 * tarjeta) del total de las tarjetas.
 */
export function getDeudaALaVista(accounts: Account[], installments: Installment[], hoy = hoyKey()): number {
  const tarjetas = accounts
    .filter((a) => a.type === 'credit')
    .reduce((s, a) => {
      const sinFacturar = deLaTarjeta(a, installments, hoy).reduce((t, c) => t + c.porFacturar, 0)
      return s + Math.max(0, safeNum(a.balance) - sinFacturar)
    }, 0)
  const ids = new Set(accounts.map((a) => a.id))
  const sueltos = installments
    .filter((i) => !i.account_id || !ids.has(i.account_id))
    .reduce((s, i) => s + calendarioDe(i, null, hoy).enEstado, 0)
  return Math.round((tarjetas + sueltos) * 100) / 100
}

/** MSI que se paga en la fecha límite `vence` de esta tarjeta. */
export function msiDelVencimiento(account: Account, installments: Installment[], vence: string, hoy = hoyKey()): number {
  return installments
    .filter((i) => i.account_id === account.id)
    .flatMap((i) => calendarioDe(i, account, hoy).meses)
    .filter((m) => m.vence === vence && cuentaEnSuFecha(m))
    .reduce((s, m) => s + m.monto, 0)
}

/**
 * Minimum payment due this cycle for a single credit account.
 * = min-revolving-payment + Σ MSI monthly amounts − prepay buffer used.
 * Result is clamped to ≥ 0 (buffer can make it $0).
 */
export function getExigibleEsteCiclo(account: Account, installments: Installment[], hoy = hoyKey()): number {
  if (account.type !== 'credit') return 0
  const revolvingBal = getRevolvingBalance(account, installments, hoy)
  const pct = safeNum(account.min_payment_pct, 1.5)
  const minRevolving =
    costType(account) === 'con_costo' ? Math.max(0, revolvingBal) * (pct / 100) : 0

  // Lo de MSI que toca en el próximo pago: lo vencido sin pagar y lo que vence
  // en esa fecha. Sin fechas de la tarjeta, una mensualidad por plan activo.
  const prox = proximoVencimiento(account, fromKey(hoy))
  const calendarios = deLaTarjeta(account, installments, hoy)
  const msiMonthly = prox
    ? calendarios
        .flatMap((c) => c.meses)
        .filter((m) => m.estado === 'vencida' || (m.vence === toKey(prox.vence) && cuentaEnSuFecha(m)))
        .reduce((s, m) => s + m.monto, 0)
    : calendarios.reduce((s, c) => s + (c.actual?.monto ?? 0), 0)
  const bufferUsed = Math.min(safeNum(account.prepay_buffer), msiMonthly)
  return Math.max(0, minRevolving + msiMonthly - bufferUsed)
}

/**
 * Total monthly payment due across all credit accounts.
 * Used as the Resumen hero "A pagar este mes".
 */
export function getTotalExigible(accounts: Account[], installments: Installment[]): number {
  return accounts
    .filter((a) => a.type === 'credit')
    .reduce((s, a) => s + getExigibleEsteCiclo(a, installments), 0)
}

/**
 * 18-month series of committed monthly payments (MSI + min-revolving).
 * The series steps down as MSI plans finish — useful for the compromisos bar chart.
 *
 * @param installments - All installment records (any status)
 * @param accounts     - All account records
 * @param horizon      - Number of months ahead to project (default 18)
 * @param now          - Reference date (default today)
 */
export function getMensualidadesComprometidas(
  installments: Installment[],
  accounts: Account[],
  horizon = 18,
  now: Date = new Date(),
): CommittedPoint[] {
  const creditAccounts = accounts.filter((a) => a.type === 'credit')

  // Flat min-revolving for con_costo accounts (MVP: treat as constant)
  const flatRevolving = creditAccounts
    .filter((a) => costType(a) === 'con_costo')
    .reduce((s, a) => {
      const pct = safeNum(a.min_payment_pct, 1.5)
      return s + getRevolvingBalance(a, installments) * (pct / 100)
    }, 0)

  const hoy = toKey(now)
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  // Cada mensualidad cae en el mes de su fecha límite; las pagadas a mano antes
  // de tiempo ya no se deben.
  const porMes = new Map<string, number>()
  for (const i of installments) {
    const ciclo = i.account_id ? accountById.get(i.account_id) ?? null : null
    for (const mes of calendarioDe(i, ciclo, hoy).meses) {
      if (mes.estado === 'pagada') continue
      const clave = mes.vence.slice(0, 7)
      porMes.set(clave, (porMes.get(clave) ?? 0) + mes.monto)
    }
  }

  const points: CommittedPoint[] = []
  for (let m = 0; m < horizon; m++) {
    const fecha = addMonths(now, m)
    const label = format(fecha, 'LLL', { locale: es })
    const msi = Math.round((porMes.get(toKey(fecha).slice(0, 7)) ?? 0) * 100) / 100

    points.push({ month: label, msi, revolving: flatRevolving, total: msi + flatRevolving })
  }
  return points
}

/**
 * Monthly "breathing room" = disposable gross income − committed payments.
 * Grows each month as MSI plans finish.
 *
 * `disposableGross` should be the current disposable *before* subtracting MSI monthly amounts,
 * i.e. `disposable + installmentsMonthly` from Proyeccion.tsx.
 */
export function getColchonReal(
  disposableGross: number,
  committed: CommittedPoint[],
): ColchonPoint[] {
  return committed.map((c) => ({
    month: c.month,
    colchon: disposableGross - c.total,
    committed: c.total,
  }))
}

/**
 * How many future months the prepay_buffer on a given account covers its MSI monthly total.
 * Returns null if there are no active MSI plans for this account.
 */
export function prepayMonthsCovered(account: Account, installments: Installment[]): number | null {
  const buffer = safeNum(account.prepay_buffer)
  if (buffer <= 0) return null
  const msiMonthly = installments
    .filter((i) => i.account_id === account.id && i.status === 'active')
    .reduce((s, i) => s + safeNum(i.monthly_amount), 0)
  if (msiMonthly <= 0) return null
  return Math.floor(buffer / msiMonthly)
}
