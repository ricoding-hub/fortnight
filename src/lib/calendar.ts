import { getExigibleEsteCiclo } from '@/lib/debt'
import type { Account, Goal, Installment, Subscription, Transaction, UserConfig } from '@/types'
import { computePaydays, type PayFreq } from '@/lib/paydays'

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
  /** Short labels shown on the day detail. */
  tags: string[]
}

/* ── date helpers ─────────────────────────────────────────────────────────── */

/** Local noon, so DST can never shift the calendar day. */
export function noon(d: Date): Date {
  const c = new Date(d)
  c.setHours(12, 0, 0, 0)
  return c
}

/** Local `YYYY-MM-DD` — never via toISOString, which is UTC. */
export function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Clamps a day-of-month to a real day (31 → 30 in November). */
export function dayInMonth(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)), 12, 0, 0, 0)
}

/** Six weeks of local-noon days covering `month`, weeks starting Sunday (es-MX). */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1, 12, 0, 0, 0)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return noon(d)
  })
}

export const WEEKDAYS_ES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'] as const

/* ── per-source date projections ──────────────────────────────────────────── */

/**
 * Payment due dates for a credit card. Mirrors the precedence in lib/dates.ts:
 * `payment_grace_days` counted from the cut wins over a fixed `payment_due_day`,
 * which is how cards like Plata bill.
 */
export function cardDueDates(account: Account, from: Date, to: Date): Date[] {
  if (account.type !== 'credit') return []
  const out: Date[] = []
  const start = noon(from)
  const end = noon(to)

  if (account.payment_grace_days != null && account.cut_day != null) {
    const cut = account.cut_day
    const grace = account.payment_grace_days
    const cur = new Date(start.getFullYear(), start.getMonth() - 1, 1, 12, 0, 0, 0)
    for (let i = 0; i < 26; i++) {
      const cutDate = dayInMonth(cur.getFullYear(), cur.getMonth() + i, cut)
      const due = noon(new Date(cutDate))
      due.setDate(cutDate.getDate() + grace)
      if (due >= start && due <= end) out.push(due)
      if (due > end) break
    }
    return out
  }

  if (account.payment_due_day == null) return []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0)
  for (let i = 0; i < 26; i++) {
    const due = dayInMonth(cur.getFullYear(), cur.getMonth() + i, account.payment_due_day)
    if (due >= start && due <= end) out.push(due)
    if (due > end) break
  }
  return out
}

export function cardCutDates(account: Account, from: Date, to: Date): Date[] {
  if (account.type !== 'credit' || account.cut_day == null) return []
  const start = noon(from)
  const end = noon(to)
  const out: Date[] = []
  for (let i = 0; i < 26; i++) {
    const d = dayInMonth(start.getFullYear(), start.getMonth() + i, account.cut_day)
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

/** Remaining MSI payments, one per month from the next one until the term ends. */
export function installmentDates(inst: Installment, from: Date, to: Date): Date[] {
  if (inst.status !== 'active') return []
  const remaining = Math.max(0, inst.months_total - inst.months_paid)
  if (remaining === 0) return []
  const startDate = inst.start_date ? fromKey(inst.start_date.slice(0, 10)) : noon(from)
  const day = startDate.getDate()
  const start = noon(from)
  const end = noon(to)

  const out: Date[] = []
  for (let i = 0; i < remaining; i++) {
    const d = dayInMonth(
      startDate.getFullYear(),
      startDate.getMonth() + inst.months_paid + i,
      day,
    )
    if (d >= start && d <= end) out.push(d)
    if (d > end) break
  }
  return out
}

/* ── event building ───────────────────────────────────────────────────────── */

export interface CalendarInput {
  accounts: Account[]
  installments: Installment[]
  subscriptions: Subscription[]
  transactions: Transaction[]
  goals: Goal[]
  config: UserConfig | null
}

export function buildCalendarEvents(input: CalendarInput, from: Date, to: Date): CalendarEvent[] {
  const { accounts, installments, subscriptions, transactions, goals, config } = input
  const out: CalendarEvent[] = []
  const start = noon(from)
  const end = noon(to)

  // Paydays — the only recurring inflow the app knows about.
  if (config?.pay_reference && config.pay_freq) {
    const ref = fromKey(config.pay_reference.slice(0, 10))
    const days = computePaydays(ref, config.pay_freq as PayFreq, 40, start)
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
    // The amount already folds in the MSI due this cycle, so instalments below
    // are markers only — otherwise the same money would be counted twice.
    const exigible = getExigibleEsteCiclo(a, installments)
    for (const d of cardDueDates(a, start, end)) {
      out.push({
        id: `due:${a.id}:${toKey(d)}`,
        kind: 'card_due',
        date: toKey(d),
        title: `Pago ${a.name}`,
        amount: -exigible,
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
      out.push({
        id: `sub:${s.id}:${toKey(d)}`,
        kind: 'subscription',
        date: toKey(d),
        title: s.name,
        amount: -Number(s.amount ?? 0),
        countsToCash: cash,
        estimated: s.frequency !== 'mensual',
        accountId: s.account_id ?? undefined,
        tags: ['Suscripción', s.frequency === 'mensual' ? 'Mensual' : s.frequency === 'trimestral' ? 'Trimestral' : 'Anual'],
      })
    }
  }

  for (const inst of installments) {
    for (const d of installmentDates(inst, start, end)) {
      out.push({
        id: `msi:${inst.id}:${toKey(d)}`,
        kind: 'installment',
        date: toKey(d),
        title: inst.name,
        amount: -Number(inst.monthly_amount ?? 0),
        // Paid through the card; the card's due event already carries it.
        countsToCash: false,
        accountId: inst.account_id ?? undefined,
        tags: ['MSI', 'En tu tarjeta'],
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

export interface CycleSummary {
  /** Payday that opens the cycle (or today when there's no reference). */
  from: string
  /** Day before the next payday. */
  to: string
  income: number
  committed: number
  /** Cash expected to survive to the next payday. */
  safeToSpend: number
  events: CalendarEvent[]
}

/**
 * The current pay cycle — "what's left before they pay me again", which is the
 * question a catorcena-based budget actually revolves around.
 */
export function cycleSummary(
  events: CalendarEvent[],
  config: UserConfig | null,
  startCash: number,
  today: Date = new Date(),
): CycleSummary | null {
  if (!config?.pay_reference || !config.pay_freq) return null
  const ref = fromKey(config.pay_reference.slice(0, 10))
  const t = noon(today)
  const next = computePaydays(ref, config.pay_freq as PayFreq, 2, t)
  if (next.length === 0) return null

  // computePaydays returns paydays >= today, so the cycle we're inside started
  // one step earlier unless today IS a payday.
  const step = next[0]
  const isToday = toKey(step) === toKey(t)
  const cycleEnd = isToday ? (next[1] ?? step) : step
  const cycleStart = isToday ? step : new Date(step)
  if (!isToday) {
    const days = Math.round((step.getTime() - t.getTime()) / 86_400_000)
    cycleStart.setDate(step.getDate() - Math.max(days, 1))
  }

  const fromKeyStr = toKey(noon(t))
  const toKeyStr = toKey(cycleEnd)
  const inCycle = events.filter((e) => e.date >= fromKeyStr && e.date < toKeyStr)
  const cash = inCycle.filter((e) => e.countsToCash)
  const income = cash.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const committed = cash.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0)

  return {
    from: fromKeyStr,
    to: toKeyStr,
    income,
    committed,
    safeToSpend: startCash + income - committed,
    events: inCycle,
  }
}
