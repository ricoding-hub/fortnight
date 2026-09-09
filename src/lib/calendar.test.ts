import { describe, expect, it } from 'vitest'
import {
  buildCalendarEvents, cardCutDates, cardDueDates, cycleSummary, dayInMonth,
  eventsByDay, fromKey, installmentDates, monthGrid, projectDailyBalance,
  subscriptionDates, toKey,
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

  it('lays out six weeks starting on Sunday', () => {
    const g = monthGrid(2026, 8) // septiembre 2026
    expect(g).toHaveLength(42)
    expect(g[0].getDay()).toBe(0)
    expect(g.some((x) => toKey(x) === '2026-09-01')).toBe(true)
    expect(g.some((x) => toKey(x) === '2026-09-30')).toBe(true)
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

describe('cycleSummary', () => {
  it('reports income, commitments and what survives to the next payday', () => {
    const ev = buildCalendarEvents({
      accounts: [], installments: [], subscriptions: [sub({ charge_day: 12, amount: 300 })],
      transactions: [], goals: [], config: config(),
    }, d('2026-09-01'), d('2026-10-31'))
    const s = cycleSummary(ev, config(), 2000, d('2026-09-09'))
    expect(s).not.toBeNull()
    expect(s!.committed).toBe(300)
    expect(s!.safeToSpend).toBe(2000 + s!.income - 300)
  })

  it('returns nothing without a pay reference', () => {
    expect(cycleSummary([], null, 0, d('2026-09-09'))).toBeNull()
    expect(cycleSummary([], config({ pay_reference: null }), 0, d('2026-09-09'))).toBeNull()
  })
})
