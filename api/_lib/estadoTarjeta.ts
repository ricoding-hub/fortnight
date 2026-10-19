/**
 * Lo mínimo del estado de cuenta para el aviso de pago (cron).
 *
 * Copia de la regla de src/lib/estadoDeCuenta.ts y src/lib/msi.ts: las
 * funciones de api/ no pueden importar de src/ (usan el alias `@/`, que aquí no
 * se resuelve). Si la regla cambia allá, cámbiala aquí; la prueba usa el mismo
 * caso (estadoTarjeta.test.ts ↔ src/lib/estadoDeCuenta.test.ts).
 *
 *   pago para no generar intereses = saldo al corte − MSI que aún no se cobra
 *   te falta                        = ese pago (o el del banco) − lo pagado desde el corte
 *
 * Sin esto, el aviso sólo se callaba si se pagaba el saldo COMPLETO al corte,
 * que trae todas las mensualidades futuras: quien pagaba justo lo que tocaba
 * seguía recibiendo «Hoy vence».
 *
 * Fechas como `YYYY-MM-DD`, calculadas en UTC a propósito (sin hora local).
 */

export interface PlanFila {
  id: string
  total_amount: number | string
  monthly_amount?: number | string | null
  months_total: number | string
  months_paid?: number | string | null
  start_date?: string | null
  created_at?: string | null
  month_status?: Record<string, unknown> | null
  billing_offset?: number | string | null
  status?: string | null
}

export interface MovFila {
  amount: number | string
  date: string
  type?: string | null
  installment_id?: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

function num(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** El día `d` del mes `m` (puede desbordar el año), recortado al largo del mes. */
function dia(y: number, m: number, d: number): string {
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, ultimo))).toISOString().slice(0, 10)
}

function partes(k: string): [number, number, number] {
  const [y, m, d] = k.split('-').map(Number)
  return [y, m - 1, d]
}

/** El corte en el que entra una compra de `fecha` (el mismo día cuenta). */
function primerCorte(cutDay: number, fecha: string): string {
  const [y, m] = partes(fecha)
  const este = dia(y, m, cutDay)
  return fecha <= este ? este : dia(y, m + 1, cutDay)
}

function corteMas(cutDay: number, corte: string, k: number): string {
  const [y, m] = partes(corte)
  return dia(y, m + k, cutDay)
}

function montoDeMes(p: PlanFila, n: number, M: number): number {
  const total = num(p.total_amount)
  const mensual = num(p.monthly_amount) || r2(total / M)
  return n < M ? mensual : Math.max(0, r2(total - mensual * (M - 1)))
}

/**
 * Las mensualidades que ya no estaban en el saldo en el corte `c`: las que se
 * traían pagadas del contador viejo, y las marcadas pagadas ese día o antes.
 */
function fueraDelSaldo(p: PlanFila, M: number, c: string): Set<number> {
  const out = new Set<number>()
  const crudo = p.month_status
  const guardadas = crudo && typeof crudo === 'object' ? Object.keys(crudo) : []
  if (guardadas.length > 0) {
    for (const k of guardadas) {
      const n = Number(k)
      if (!Number.isInteger(n) || n < 1 || n > M) continue
      const v = (crudo as Record<string, { s?: unknown; at?: unknown } | null>)[k]
      if (v?.s !== 'paid') continue
      // Sin fecha = traída del contador viejo; con fecha, sólo si fue antes del corte.
      if (typeof v.at !== 'string' || v.at <= c) out.add(n)
    }
    return out
  }
  const previas = p.status === 'paid' ? M : Math.min(M, Math.max(0, Math.round(num(p.months_paid))))
  for (let n = 1; n <= previas; n++) out.add(n)
  return out
}

function compraDe(p: PlanFila): string | null {
  const compra = /^\d{4}-\d{2}-\d{2}/.test(String(p.start_date ?? ''))
    ? String(p.start_date).slice(0, 10)
    : String(p.created_at ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(compra) ? compra : null
}

/** Cada mensualidad del plan con su corte, su monto y su marca «pagada» (si la tiene). */
function mesesDelPlan(p: PlanFila, cutDay: number): { n: number; corte: string; monto: number; pagadaEl: string | null }[] {
  const compra = compraDe(p)
  if (!compra) return []
  const M = Math.max(1, Math.round(num(p.months_total, 1)))
  const offset = Math.min(12, Math.max(0, Math.round(num(p.billing_offset))))
  const primero = primerCorte(cutDay, compra)
  const crudo = p.month_status && typeof p.month_status === 'object' ? (p.month_status as Record<string, { s?: unknown; at?: unknown } | null>) : {}
  const out = []
  for (let n = 1; n <= M; n++) {
    const v = crudo[String(n)]
    out.push({
      n,
      corte: corteMas(cutDay, primero, offset + n - 1),
      monto: montoDeMes(p, n, M),
      pagadaEl: v?.s === 'paid' && typeof v.at === 'string' ? v.at : null,
    })
  }
  return out
}

/**
 * Cuánto de un abono paga el estado que corta en `c` (igual que en la app):
 * el ajuste de «Liquidar» lleva el plan y sólo cuenta por las mensualidades de
 * ese plan que ya estaban en ese corte o antes y que la liquidación marcó.
 */
function abonoAplicable(m: MovFila, c: string, planes: PlanFila[], cutDay: number): number {
  const monto = -num(m.amount)
  if (!m.installment_id || m.type === 'installment' || m.type === 'transfer') return monto
  const plan = planes.find((p) => p.id === m.installment_id)
  if (!plan) return monto
  const meses = mesesDelPlan(plan, cutDay)
  // Sin marcas con fecha (sin la migración 036): cuenta completo, como antes.
  if (!meses.some((x) => x.pagadaEl != null)) return monto
  const fecha = String(m.date).slice(0, 10)
  const enEste = meses
    .filter((x) => x.corte <= c && x.pagadaEl != null && x.pagadaEl >= fecha)
    .reduce((s, x) => s + x.monto, 0)
  return Math.min(monto, enEste)
}

/**
 * Mensualidades MSI que en el corte `c` todavía no se cobraban. `cargos`: el
 * día del cargo de cada plan (desde cuándo está en el saldo); sin cargo, la
 * fecha de compra.
 */
export function msiNoFacturado(planes: PlanFila[], cargos: ReadonlyMap<string, string>, cutDay: number, c: string): number {
  let total = 0
  for (const p of planes) {
    const compra = compraDe(p)
    if (!compra) continue
    const enSaldoDesde = cargos.get(p.id) ?? compra
    if (enSaldoDesde > c) continue
    const M = Math.max(1, Math.round(num(p.months_total, 1)))
    const offset = Math.min(12, Math.max(0, Math.round(num(p.billing_offset))))
    const fuera = fueraDelSaldo(p, M, c)
    const primero = primerCorte(cutDay, compra)
    for (let n = 1; n <= M; n++) {
      if (fuera.has(n)) continue
      if (corteMas(cutDay, primero, offset + n - 1) > c) total += montoDeMes(p, n, M)
    }
  }
  return r2(total)
}

/**
 * Cuánto falta del estado de cuenta que corta en `c`. `movs`: los de la
 * tarjeta con fecha posterior al corte. `banco`: la cifra capturada, si hay.
 */
export function faltaDelEstado(i: {
  saldo: number
  movs: MovFila[]
  planes: PlanFila[]
  cargos: ReadonlyMap<string, string>
  cutDay: number
  corte: string
  banco: number | null
}): { pngi: number; pagado: number; falta: number } {
  const despues = i.movs.filter((m) => String(m.date).slice(0, 10) > i.corte)
  const saldoAlCorte = i.saldo - despues.reduce((s, m) => s + num(m.amount), 0)
  const pagado = r2(
    despues.filter((m) => num(m.amount) < 0).reduce((s, m) => s + abonoAplicable(m, i.corte, i.planes, i.cutDay), 0),
  )
  const pngi = r2(i.banco ?? Math.max(0, saldoAlCorte - msiNoFacturado(i.planes, i.cargos, i.cutDay, i.corte)))
  return { pngi, pagado, falta: r2(Math.max(0, pngi - pagado)) }
}
