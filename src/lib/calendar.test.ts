import { describe, expect, it } from 'vitest'
import {
  buildCalendarEvents, cardCutDates, cardDueDates, dayInMonth,
  eventsByDay, fromKey, installmentDates, monthGrid, monthTotals, projectDailyBalance,
  startOfWeekMx, subscriptionDates, toKey, weekdayIndex, type CalendarEvent,
} from '@/lib/calendar'
import type { Account, Installment, Subscription, UserConfig } from '@/types'

const d = (s: string) => fromKey(s)

function account(over: Partial<Account> = {}): Account {
  return {
    id: 'a1', user_id: 'u', name: 'Tarjeta', type: 'credit', balance: 10000,
    credit_limit: 50000, cut_day: null, payment_due_day: null, payment_grace_days: null,
    color: null, logo_domain: null, sort_order: null, created_at: '', updated_at: '',
    source: 'manual', syncfy_credential_id: null, external_id: null, institution_name: null,
    last_synced_at: null, cost_type: 'con_costo', apr: null, min_payment_pct: null,
    prepay_buffer: 0, ...over,
  } as Account
}
function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 's1', user_id: 'u', account_id: null, name: 'Netflix', amount: 299,
    frequency: 'mensual', charge_day: 10, category_id: null, brand_id: null, color: null,
    notes: null, active: true, created_at: '2026-01-10T00:00:00Z', updated_at: '', ...over,
  } as Subscription
}
function msi(over: Partial<Installment> = {}): Installment {
  return {
    id: 'i1', user_id: 'u', account_id: 'a1', name: 'Laptop', total_amount: 12000,
    monthly_amount: 1000, months_total: 12, months_paid: 2, start_date: '2026-01-05',
    status: 'active', is_zero_interest: true, created_at: '', updated_at: '', ...over,
  } as Installment
}
const config = (over: Partial<UserConfig> = {}) =>
  ({ pay_freq: 'catorcenal', pay_reference: '2026-09-04', pay_amount: 8000, ...over }) as UserConfig

describe('date helpers', () => {
  // toISOString would shift the day for evening users in CDMX (UTC-6).
  it('builds keys from local time, not UTC', () => {
    expect(toKey(new Date(2026, 8, 9, 23, 30))).toBe('2026-09-09')
    expect(toKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
  })

  it('round-trips a key', () => {
    expect(toKey(fromKey('2026-02-28'))).toBe('2026-02-28')
  })

  it('clamps a day of month that does not exist', () => {
    expect(toKey(dayInMonth(2026, 10, 31))).toBe('2026-11-30') // noviembre tiene 30
    expect(toKey(dayInMonth(2026, 1, 31))).toBe('2026-02-28')  // febrero 2026
  })

  it('lays out six weeks starting on Monday', () => {
    const g = monthGrid(2026, 8) // septiembre 2026
    expect(g).toHaveLength(42)
    expect(g[0].getDay()).toBe(1)
    expect(g.some((x) => toKey(x) === '2026-09-01')).toBe(true)
    expect(g.some((x) => toKey(x) === '2026-09-30')).toBe(true)
  })

  // Noviembre 2026 empieza en domingo, el desfase máximo con semana de lunes.
  it('still fits a whole month when the offset is the widest possible', () => {
    const g = monthGrid(2026, 10)
    expect(g[0].getDay()).toBe(1)
    expect(toKey(g[0])).toBe('2026-10-26')
    expect(g.some((x) => toKey(x) === '2026-11-01')).toBe(true)
    expect(g.some((x) => toKey(x) === '2026-11-30')).toBe(true)
  })
})

describe('week start', () => {
  it('counts Monday as the first day', () => {
    expect(weekdayIndex(fromKey('2026-09-07'))).toBe(0) // lunes
    expect(weekdayIndex(fromKey('2026-09-09'))).toBe(2) // miércoles
    expect(weekdayIndex(fromKey('2026-09-12'))).toBe(5) // sábado
    expect(weekdayIndex(fromKey('2026-09-13'))).toBe(6) // domingo
  })

  it('walks back to the Monday of the same week', () => {
    expect(toKey(startOfWeekMx(fromKey('2026-09-09')))).toBe('2026-09-07')
    expect(toKey(startOfWeekMx(fromKey('2026-09-07')))).toBe('2026-09-07')
  })

  // El error clásico del `% 7` mal puesto: mandar el domingo a la semana que
  // empieza al día siguiente en vez de a la que está cerrando.
  it('leaves Sunday in the week that is ending, not the one starting', () => {
    expect(toKey(startOfWeekMx(fromKey('2026-09-13')))).toBe('2026-09-07')
    expect(toKey(startOfWeekMx(fromKey('2026-09-14')))).toBe('2026-09-14')
  })

  it('crosses a month boundary', () => {
    expect(toKey(startOfWeekMx(fromKey('2026-10-01')))).toBe('2026-09-28')
  })

  it('keeps local noon, so a DST shift cannot move the day', () => {
    expect(startOfWeekMx(fromKey('2026-09-09')).getHours()).toBe(12)
  })

  it('labels the columns in the order the grid draws them', () => {
    const g = monthGrid(2026, 8)
    for (let i = 0; i < 7; i++) expect(weekdayIndex(g[i])).toBe(i)
  })
})

describe('tarjetas', () => {
  it('projects a fixed due day each month', () => {
    const got = cardDueDates(account({ payment_due_day: 15 }), d('2026-09-01'), d('2026-11-30'))
    expect(got.map(toKey)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15'])
  })

  // Grace days counted from the cut take precedence — this is how Plata bills.
  it('prefers grace days over a fixed due day', () => {
    const a = account({ cut_day: 5, payment_grace_days: 20, payment_due_day: 28 })
    const got = cardDueDates(a, d('2026-09-01'), d('2026-10-31')).map(toKey)
    expect(got).toContain('2026-09-25')
    expect(got).toContain('2026-10-25')
    expect(got).not.toContain('2026-09-28')
  })

  it('gives cut dates separately', () => {
    const got = cardCutDates(account({ cut_day: 28 }), d('2026-09-01'), d('2026-10-31'))
    expect(got.map(toKey)).toEqual(['2026-09-28', '2026-10-28'])
  })

  it('ignores debit accounts', () => {
    expect(cardDueDates(account({ type: 'debit', payment_due_day: 5 }), d('2026-09-01'), d('2026-12-31'))).toEqual([])
  })
})

describe('suscripciones', () => {
  it('charges monthly on its day', () => {
    const got = subscriptionDates(sub(), d('2026-09-01'), d('2026-11-30')).map(toKey)
    expect(got).toEqual(['2026-09-10', '2026-10-10', '2026-11-10'])
  })

  // Quarterly has no anchor month stored, so it is derived from created_at.
  it('spaces a quarterly charge three months from its anchor', () => {
    const s = sub({ frequency: 'trimestral', created_at: '2026-01-10T00:00:00Z' })
    const got = subscriptionDates(s, d('2026-09-01'), d('2026-12-31')).map(toKey)
    expect(got).toEqual(['2026-10-10'])
  })

  it('skips inactive subscriptions', () => {
    expect(subscriptionDates(sub({ active: false }), d('2026-09-01'), d('2026-12-31'))).toEqual([])
  })
})

describe('mensualidades', () => {
  it('projects only the months still owed', () => {
    // 12 meses, 2 pagados -> quedan 10, empezando en el mes 2 desde enero
    const got = installmentDates(msi(), d('2026-01-01'), d('2027-12-31')).map(toKey)
    expect(got).toHaveLength(10)
    expect(got[0]).toBe('2026-03-05')
  })

  it('ignores a finished plan', () => {
    expect(installmentDates(msi({ status: 'paid' }), d('2026-01-01'), d('2027-12-31'))).toEqual([])
    expect(installmentDates(msi({ months_paid: 12 }), d('2026-01-01'), d('2027-12-31'))).toEqual([])
  })
})

describe('buildCalendarEvents', () => {
  const base = {
    accounts: [account({ payment_due_day: 15, cut_day: 1 })],
    installments: [msi()],
    subscriptions: [sub()],
    transactions: [],
    goals: [],
    config: config(),
  }

  it('produces every kind of event', () => {
    const ev = buildCalendarEvents(base, d('2026-09-01'), d('2026-09-30'))
    const kinds = new Set(ev.map((e) => e.kind))
    expect(kinds.has('payday')).toBe(true)
    expect(kinds.has('card_due')).toBe(true)
    expect(kinds.has('card_cut')).toBe(true)
    expect(kinds.has('subscription')).toBe(true)
    expect(kinds.has('installment')).toBe(true)
  })

  // The whole point of the cash model: an MSI is paid THROUGH the card, and the
  // card's due amount already includes it. Counting both would double the money.
  it('does not let an MSI move cash twice', () => {
    const ev = buildCalendarEvents(base, d('2026-09-01'), d('2026-09-30'))
    expect(ev.filter((e) => e.kind === 'installment').every((e) => !e.countsToCash)).toBe(true)
    expect(ev.filter((e) => e.kind === 'card_due').every((e) => e.countsToCash)).toBe(true)
  })

  it('treats a subscription on a card as debt, not cash', () => {
    const onCard = buildCalendarEvents(
      { ...base, subscriptions: [sub({ account_id: 'a1' })] }, d('2026-09-01'), d('2026-09-30'),
    ).find((e) => e.kind === 'subscription')
    expect(onCard?.countsToCash).toBe(false)

    const onDebit = buildCalendarEvents(
      { ...base, accounts: [account({ id: 'd1', type: 'debit' })], subscriptions: [sub({ account_id: 'd1' })] },
      d('2026-09-01'), d('2026-09-30'),
    ).find((e) => e.kind === 'subscription')
    expect(onDebit?.countsToCash).toBe(true)
  })

  it('signs income positive and outflows negative', () => {
    const ev = buildCalendarEvents(base, d('2026-09-01'), d('2026-09-30'))
    expect(ev.find((e) => e.kind === 'payday')!.amount).toBeGreaterThan(0)
    expect(ev.find((e) => e.kind === 'subscription')!.amount).toBeLessThan(0)
    expect(ev.find((e) => e.kind === 'card_cut')!.amount).toBe(0)
  })

  it('never counts a past movement toward the projection', () => {
    const ev = buildCalendarEvents({
      ...base,
      transactions: [{ id: 't1', date: '2026-09-08', amount: -500, description: 'Café' } as never],
    }, d('2026-09-01'), d('2026-09-30'))
    expect(ev.find((e) => e.kind === 'transaction')!.countsToCash).toBe(false)
  })

  it('groups by day', () => {
    const ev = buildCalendarEvents(base, d('2026-09-01'), d('2026-09-30'))
    const byDay = eventsByDay(ev)
    expect(byDay.get('2026-09-10')?.some((e) => e.kind === 'subscription')).toBe(true)
  })
})

describe('projectDailyBalance', () => {
  it('applies only future cash events', () => {
    const ev = buildCalendarEvents({
      accounts: [], installments: [], subscriptions: [sub({ charge_day: 20 })],
      transactions: [], goals: [], config: null,
    }, d('2026-09-01'), d('2026-09-30'))
    const bal = projectDailyBalance(ev, 5000, d('2026-09-01'), d('2026-09-30'), d('2026-09-15'))
    expect(bal.get('2026-09-19')).toBe(5000)
    expect(bal.get('2026-09-20')).toBe(4701) // 5000 - 299
  })

  it('leaves days before today untouched', () => {
    const bal = projectDailyBalance([], 1234, d('2026-09-01'), d('2026-09-05'), d('2026-09-03'))
    expect(bal.get('2026-09-01')).toBe(1234)
  })
})

/* ── Gastos fijos con fecha ───────────────────────────────────────────────── */

describe('gastos fijos', () => {
  const renta: Subscription = {
    id: 'f1', user_id: 'u', account_id: null, kind: 'fijo', name: 'Renta',
    amount: 9500, frequency: 'mensual', charge_day: 5, category_id: 'c-renta',
    brand_id: null, color: null, notes: null, active: true,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
  const netflix: Subscription = { ...renta, id: 's1', kind: 'suscripcion', name: 'Netflix', amount: 299, charge_day: 12, category_id: null }

  const vacio = { accounts: [], installments: [], transactions: [], goals: [], config: null }

  it('salen en el calendario el día que toca, y como gasto fijo', () => {
    const ev = buildCalendarEvents(
      { ...vacio, subscriptions: [renta] },
      new Date(2026, 8, 1, 12),
      new Date(2026, 8, 30, 12),
    )
    const e = ev.find((x) => x.title === 'Renta')!
    expect(e).toBeTruthy()
    expect(e.date).toBe('2026-09-05')
    expect(e.kind).toBe('fixed')
    expect(e.amount).toBe(-9500)
    expect(e.tags).toContain('Gasto fijo')
  })

  it('se distinguen de una suscripción', () => {
    // Por dentro son la misma fila; al leerlos no deben pesar igual, porque la
    // renta es una fecha que no se mueve y Netflix se puede cancelar.
    const ev = buildCalendarEvents(
      { ...vacio, subscriptions: [renta, netflix] },
      new Date(2026, 8, 1, 12),
      new Date(2026, 8, 30, 12),
    )
    expect(ev.find((x) => x.title === 'Renta')!.kind).toBe('fixed')
    expect(ev.find((x) => x.title === 'Netflix')!.kind).toBe('subscription')
  })

  it('suman a los egresos del mes cuando no van a una tarjeta', () => {
    const ev = buildCalendarEvents(
      { ...vacio, subscriptions: [renta] },
      new Date(2026, 8, 1, 12),
      new Date(2026, 8, 30, 12),
    )
    expect(monthTotals(ev, 2026, 8).outflow).toBe(9500)
  })
})

/* ── El mes es el mes ─────────────────────────────────────────────────────── */

describe('monthTotals', () => {
  const pago = (fecha: string): CalendarEvent => ({
    id: `p:${fecha}`, kind: 'payday', date: fecha, title: 'Te pagan',
    amount: 9800, countsToCash: true, tags: [],
  })

  it('no cuenta los días de otros meses que la rejilla arrastra', () => {
    // El fallo reportado, en una línea: la cuadrícula de septiembre llega hasta
    // el 4 de octubre, así que un pago del 1 de octubre aparecía dentro y
    // septiembre decía tres pagos donde hay dos.
    const eventos = [pago('2026-09-04'), pago('2026-09-18'), pago('2026-10-02')]
    expect(monthTotals(eventos, 2026, 8).paydays).toBe(2)
    expect(monthTotals(eventos, 2026, 8).inflow).toBe(19600)
  })

  it('ese mismo pago sí cuenta en su mes, y una sola vez', () => {
    const eventos = [pago('2026-09-04'), pago('2026-09-18'), pago('2026-10-02')]
    expect(monthTotals(eventos, 2026, 9).paydays).toBe(1)
    expect(monthTotals(eventos, 2026, 9).inflow).toBe(9800)
  })

  it('tampoco cuenta los días del mes anterior', () => {
    const eventos = [pago('2026-08-31'), pago('2026-09-11')]
    expect(monthTotals(eventos, 2026, 8).paydays).toBe(1)
  })

  it('tres pagos en un mes sí son tres cuando de verdad caen ahí', () => {
    // Con catorcena pasa de verdad y no hay que "arreglarlo": 14 días de paso
    // caben tres veces en un mes de 31. Lo que no vale es que sean tres porque
    // uno se coló de la rejilla.
    const eventos = [pago('2026-09-04'), pago('2026-09-18'), pago('2026-09-30')]
    expect(monthTotals(eventos, 2026, 8).paydays).toBe(3)
  })

  it('lo que no mueve efectivo no suma, pero un pago sí se cuenta', () => {
    const corte: CalendarEvent = {
      id: 'c', kind: 'card_cut', date: '2026-09-12', title: 'Corte',
      amount: 0, countsToCash: false, tags: [],
    }
    const t = monthTotals([pago('2026-09-04'), corte], 2026, 8)
    expect(t.inflow).toBe(9800)
    expect(t.outflow).toBe(0)
    expect(t.paydays).toBe(1)
  })
})
