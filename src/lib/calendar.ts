import { getRevolvingBalance, msiDelVencimiento, msiVencido } from '@/lib/debt'
import { calendarioDe, type CalendarioMsi, type EstadoMes } from '@/lib/msi'
import type { Account, Goal, Installment, Subscription, Transaction, UserConfig } from '@/types'
import { computePaydays, payFreqOf } from '@/lib/paydays'
import { corteEn, tieneVencimiento, vencimientosEntre } from '@/lib/cardCycle'
import { dayInMonth, fromKey, noon, toKey } from '@/lib/localDate'

/**
 * The financial calendar.
 *
 * What separates this from a plain month grid is that every event carries a
 * signed amount and says whether it actually moves cash, so the calendar can
 * project a running balance and answer the only question that matters between
 * paydays: how much is really left.
 *
 * Cash model — deliberately avoids double counting:
 *   · A payday adds cash.
 *   · A credit-card payment removes cash, and its amount already includes the
 *     MSI due that cycle (getExigibleEsteCiclo).
 *   · An MSI instalment is therefore informational: it is paid THROUGH the
 *     card, so counting it again would double it.
 *   · A subscription charged to a credit card does not move cash on its charge
 *     day either — it raises the card balance and is settled on the card's due
 *     date. Charged to a debit account, it does move cash.
 *   · A cut date moves nothing; it marks the cycle.
 *
 * All dates are local-noon `Date`s and `YYYY-MM-DD` keys built from local
 * getters. The codebase already uses the noon idiom to dodge DST; using
 * `toISOString().slice(0,10)` here would shift a day for evening users in CDMX.
 */

export type CalendarEventKind =
  | 'payday'
  | 'card_due'
  | 'card_cut'
  | 'subscription'
  /** Gasto fijo con fecha: renta, luz, colegiatura. */
  | 'fixed'
  | 'installment'
  | 'goal'
  | 'transaction'

export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  /** Local `YYYY-MM-DD`. */
  date: string
  title: string
  /** Signed: positive adds money, negative takes it. Zero for pure markers. */
  amount: number
  /** Whether this moves liquid cash — drives the projected balance. */
  countsToCash: boolean
  /** True when the amount is a forecast rather than a known figure. */
  estimated?: boolean
  accountId?: string
  /** Proveedor del cargo (CFE, Telmex…), para pintar su logo en el marcador. */
  brandId?: string
  /** Mensualidad de un plan a meses: qué plan, cuál de cuántas y en qué estado. */
  installmentId?: string
  mes?: { n: number; de: number; estado: EstadoMes }
  /** Short labels shown on the day detail. */
  tags: string[]
}

/* ── date helpers ─────────────────────────────────────────────────────────── */

// Viven en localDate.ts (sin dependencias) y se reexportan aquí: el resto de
// la app sigue importándolas de `@/lib/calendar`.
export { noon, toKey, fromKey, lastDayOfMonth, dayInMonth } from '@/lib/localDate'

/**
 * 0 = lunes … 6 = domingo. `Date.getDay()` counts from Sunday, which is the US
 * week; in Mexico the weekend belongs at the end of the row, not split across
 * both edges.
 */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

/**
 * The local-noon Monday that opens the week containing `d`. The one place that
 * decides where a week begins — the month grid, Home's week strip, the mission
 * counters and the weekly score delta all read it from here, so "esta semana"
 * can only ever mean one thing.
 */
export function startOfWeekMx(d: Date): Date {
  const start = noon(new Date(d))
  start.setDate(d.getDate() - weekdayIndex(d))
  return start
}

/**
 * Six weeks of local-noon days covering `month`, weeks starting Monday (es-MX).
 * 42 cells always suffice: the widest offset is 6 and the longest month is 31.
 */
export function monthGrid(year: number, month: number): Date[] {
  const start = startOfWeekMx(new Date(year, month, 1, 12, 0, 0, 0))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return noon(d)
  })
}

/** Column order of the grid. Index with `weekdayIndex`, never with `getDay()`. */
export const WEEKDAYS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'] as const

/* ── per-source date projections ──────────────────────────────────────────── */

/**
 * Payment due dates for a credit card. `payment_grace_days` counted from the
 * cut wins over a fixed `payment_due_day`, which is how cards like Plata bill.
 * The cycle math lives in cardCycle.ts.
 */
export function cardDueDates(account: Account, from: Date, to: Date): Date[] {
  return vencimientosEntre(account, from, to).map((v) => v.vence)
}

export function cardCutDates(account: Account, from: Date, to: Date): Date[] {
  if (account.type !== 'credit') return []
  const start = noon(from)
  const end = noon(to)
  const out: Date[] = []
  for (let i = 0; i < 26; i++) {
    const d = corteEn(account, start.getFullYear(), start.getMonth() + i)
    if (!d) return []
    if (d >= start && d <= end) out.push(d)
    if (d > end) break
  }
  return out
}

/**
 * Charge dates for a subscription. Monthly is exact. Quarterly and annual have
 * no anchor month stored — only `charge_day` — so the month is derived from
 * `created_at`, and those events are flagged as estimates.
 */
export function subscriptionDates(sub: Subscription, from: Date, to: Date): Date[] {
  if (!sub.active) return []
  const start = noon(from)
  const end = noon(to)
  const step = sub.frequency === 'anual' ? 12 : sub.frequency === 'trimestral' ? 3 : 1
  const anchor = sub.created_at ? new Date(sub.created_at) : start
  const anchorMonth = anchor.getMonth()

  const out: Date[] = []
  for (let i = 0; i < 26; i++) {
    const m = start.getMonth() + i
    if (step > 1) {
      const abs = start.getFullYear() * 12 + m
      const anchorAbs = anchor.getFullYear() * 12 + anchorMonth
      if ((abs - anchorAbs) % step !== 0) continue
    }
    const d = dayInMonth(start.getFullYear(), m, sub.charge_day)
    if (d >= start && d <= end) out.push(d)
    if (d > end) break
  }
  return out
}

/* ── event building ───────────────────────────────────────────────────────── */

export interface CalendarInput {
  accounts: Account[]
  installments: (Installment & { msi?: CalendarioMsi })[]
  subscriptions: Subscription[]
  transactions: Transaction[]
  goals: Goal[]
  config: UserConfig | null
}

export function buildCalendarEvents(
  input: CalendarInput,
  from: Date,
  to: Date,
  hoy: string = toKey(new Date()),
): CalendarEvent[] {
  const { accounts, installments, subscriptions, transactions, goals, config } = input
  const out: CalendarEvent[] = []
  const start = noon(from)
  const end = noon(to)

  // Paydays — the only recurring inflow the app knows about.
  if (config?.pay_reference && config.pay_freq) {
    const ref = fromKey(config.pay_reference.slice(0, 10))
    const days = computePaydays(ref, payFreqOf(config.pay_freq), 40, start)
    for (const d of days) {
      if (d < start || d > end) continue
      out.push({
        id: `payday:${toKey(d)}`,
        kind: 'payday',
        date: toKey(d),
        title: 'Te pagan',
        amount: Number(config.pay_amount ?? 0),
        countsToCash: true,
        tags: ['Ingreso'],
      })
    }
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]))

  for (const a of accounts.filter((x) => x.type === 'credit')) {
    // The amount already folds in the MSI due on that date, so instalments below
    // are markers only — otherwise the same money would be counted twice. Each
    // due date carries ITS statement's mensualidades (it used to repeat one
    // figure forever, even after a plan ended); the revolving minimum goes on
    // the next payment only.
    const pct = a.min_payment_pct == null ? 1.5 : Number(a.min_payment_pct)
    const minimo =
      (a.cost_type ?? 'con_costo') === 'con_costo'
        ? getRevolvingBalance(a, installments, hoy) * ((Number.isFinite(pct) ? pct : 1.5) / 100)
        : 0
    let primero = true
    for (const d of cardDueDates(a, start, end)) {
      const key = toKey(d)
      const esProximo = primero && key >= hoy
      if (esProximo) primero = false
      // Lo vencido sin pagar se arrastra al siguiente pago.
      const msi = msiDelVencimiento(a, installments, key, hoy) + (esProximo ? msiVencido(a, installments, hoy) : 0)
      const buffer = Math.min(Number(a.prepay_buffer ?? 0) || 0, msi)
      const exigible = Math.max(0, (esProximo ? minimo : 0) + msi - (esProximo ? buffer : 0))
      out.push({
        id: `due:${a.id}:${toKey(d)}`,
        kind: 'card_due',
        date: toKey(d),
        title: `Pago ${a.name}`,
        amount: -Math.round(exigible * 100) / 100,
        countsToCash: true,
        estimated: true,
        accountId: a.id,
        tags: ['Tarjeta', 'Pago'],
      })
    }
    for (const d of cardCutDates(a, start, end)) {
      out.push({
        id: `cut:${a.id}:${toKey(d)}`,
        kind: 'card_cut',
        date: toKey(d),
        title: `Corte ${a.name}`,
        amount: 0,
        countsToCash: false,
        accountId: a.id,
        tags: ['Tarjeta', 'Corte'],
      })
    }
  }

  for (const s of subscriptions) {
    const acc = s.account_id ? accountById.get(s.account_id) : undefined
    // On a card it raises the balance and is settled on the card's due date.
    const cash = !acc || acc.type === 'debit'
    for (const d of subscriptionDates(s, start, end)) {
      const esFijo = s.kind === 'fijo'
      out.push({
        id: `sub:${s.id}:${toKey(d)}`,
        // Mismo dato por dentro, distinto peso al leerlo: la renta es una fecha
        // que no se puede mover y Netflix es un cobro que se puede cancelar.
        kind: esFijo ? 'fixed' : 'subscription',
        date: toKey(d),
        title: s.name,
        amount: -Number(s.amount ?? 0),
        countsToCash: cash,
        estimated: s.frequency !== 'mensual',
        accountId: s.account_id ?? undefined,
        brandId: s.brand_id ?? undefined,
        tags: [
          esFijo ? 'Gasto fijo' : 'Suscripción',
          s.frequency === 'mensual' ? 'Mensual' : s.frequency === 'trimestral' ? 'Trimestral' : 'Anual',
        ],
      })
    }
  }

  const ESTADO: Record<EstadoMes, string> = {
    pagada: 'Pagada',
    'por-pagar': 'En tu estado de cuenta',
    vencida: 'Vencida',
    proxima: 'Próxima',
  }
  const desde = toKey(start)
  const hasta = toKey(end)
  for (const inst of installments) {
    const tarjeta = inst.account_id ? accountById.get(inst.account_id) ?? null : null
    const cal = calendarioDe(inst, tarjeta, hoy)
    // Con una tarjeta con fecha de pago, el pago de la tarjeta ya la lleva. Sin
    // ella (o sin tarjeta), sale de tu efectivo el día que vence.
    const porTarjeta = tieneVencimiento(tarjeta)
    const M = cal.meses.length
    for (const m of cal.meses) {
      if (m.vence < desde || m.vence > hasta) continue
      out.push({
        id: `msi:${inst.id}:${m.n}`,
        kind: 'installment',
        date: m.vence,
        title: inst.name,
        amount: -m.monto,
        countsToCash: !porTarjeta && m.estado !== 'pagada',
        estimated: m.venceEstimado,
        accountId: inst.account_id ?? undefined,
        installmentId: inst.id,
        mes: { n: m.n, de: M, estado: m.estado },
        tags: ['MSI', `${m.n} de ${M}`, ESTADO[m.estado]],
      })
    }
  }

  for (const g of goals) {
    if (!g.deadline) continue
    const d = fromKey(g.deadline.slice(0, 10))
    if (d < start || d > end) continue
    out.push({
      id: `goal:${g.id}`,
      kind: 'goal',
      date: toKey(d),
      title: g.name,
      amount: 0,
      countsToCash: false,
      tags: ['Meta'],
    })
  }

  // Past movements: already reflected in the balance, so never projected.
  for (const t of transactions) {
    const d = fromKey(t.date.slice(0, 10))
    if (d < start || d > end) continue
    out.push({
      id: `tx:${t.id}`,
      kind: 'transaction',
      date: toKey(d),
      title: t.description || (Number(t.amount) >= 0 ? 'Ingreso' : 'Gasto'),
      amount: Number(t.amount),
      countsToCash: false,
      accountId: t.account_id ?? undefined,
      tags: ['Movimiento'],
    })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
}

/** Events indexed by day key. */
export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const m = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const list = m.get(e.date)
    if (list) list.push(e)
    else m.set(e.date, [e])
  }
  return m
}

/**
 * Projected liquid balance at the end of each day, starting from today's cash.
 * Only future cash events move it; past days keep the current balance so the
 * line never pretends to know history it doesn't have.
 */
export function projectDailyBalance(
  events: CalendarEvent[],
  startCash: number,
  from: Date,
  to: Date,
  today: Date = new Date(),
): Map<string, number> {
  const byDay = eventsByDay(events.filter((e) => e.countsToCash))
  const out = new Map<string, number>()
  const todayKey = toKey(noon(today))
  let running = startCash
  const cur = noon(from)
  const end = noon(to)
  while (cur <= end) {
    const key = toKey(cur)
    if (key >= todayKey) {
      for (const e of byDay.get(key) ?? []) running += e.amount
    }
    out.set(key, running)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/* ── Totales del mes ──────────────────────────────────────────────────────── */

/** Prefijo `YYYY-MM` a partir de año y mes (0-11), sin pasar por Date. */
export function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * Los eventos que caen DENTRO del mes.
 *
 * La rejilla arrastra días del mes anterior y del siguiente para completar las
 * semanas. Verlos está bien; contarlos no. Un pago que cae el 1 de octubre sale
 * en la cuadrícula de septiembre y vuelve a salir en la de octubre: quien mira
 * septiembre cuenta tres pagos donde hay dos, y el mes siguiente cuenta el
 * mismo otra vez.
 */
export function eventsInMonth(events: CalendarEvent[], year: number, month: number): CalendarEvent[] {
  const p = monthPrefix(year, month)
  return events.filter((e) => e.date.slice(0, 7) === p)
}

export interface MonthTotals {
  /** Entradas de efectivo del mes. */
  inflow: number
  /** Salidas de efectivo del mes, en positivo. */
  outflow: number
  /** Cuántas veces te pagan este mes. Con catorcena pueden ser 2 o 3. */
  paydays: number
}

/**
 * Lo que entra, lo que sale y cuántos pagos hay, contando sólo el mes pedido.
 *
 * Vive aquí y no en el componente para poder probarlo: el fallo que arregla es
 * exactamente un error de conteo, y un error de conteo sin prueba vuelve.
 */
export function monthTotals(events: CalendarEvent[], year: number, month: number): MonthTotals {
  let inflow = 0
  let outflow = 0
  let paydays = 0
  for (const e of eventsInMonth(events, year, month)) {
    if (e.kind === 'payday') paydays++
    if (!e.countsToCash) continue
    if (e.amount > 0) inflow += e.amount
    else outflow -= e.amount
  }
  return { inflow, outflow, paydays }
}
