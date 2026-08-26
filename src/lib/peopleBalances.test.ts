import { describe, expect, it } from 'vitest'
import { derivePeopleBalances, type BalancesInput } from '@/lib/peopleBalances'
import type { Loan, LoanPayment, Profile, SplitMember } from '@/types'

const ME = 'user-me'

function loan(over: Partial<Loan> & { name: string }): Loan {
  return {
    id: over.id ?? `loan-${over.name}-${over.amount ?? 0}-${over.paid_at ?? 'open'}`,
    user_id: ME,
    amount: 100,
    notes: null,
    direction: 'owed_to_me',
    created_at: '2026-06-01T00:00:00Z',
    paid_at: null,
    group_id: null,
    ...over,
  }
}

function input(over: Partial<BalancesInput> = {}): BalancesInput {
  return {
    active: [],
    paid: [],
    paymentsByLoan: {},
    splitGroups: [],
    profiles: new Map<string, Profile>(),
    displayName: (m: SplitMember) => m.name,
    userId: ME,
    ...over,
  }
}

describe('derivePeopleBalances', () => {
  it('returns nothing when logged out', () => {
    const r = derivePeopleBalances(input({ active: [loan({ name: 'Ana' })], userId: undefined }))
    expect(r.entries).toHaveLength(0)
  })

  it('nets open loans per contact and keeps the loans on the entry', () => {
    const a = loan({ id: 'l1', name: 'Ana', amount: 300 })
    const b = loan({ id: 'l2', name: 'Ana', amount: 100, direction: 'i_owe' })
    const r = derivePeopleBalances(input({ active: [a, b] }))

    expect(r.entries).toHaveLength(1)
    const ana = r.entries[0]
    expect(ana.name).toBe('Ana')
    expect(ana.net).toBe(200)
    expect(ana.count).toBe(2)
    expect(ana.loans.map((l) => l.id).sort()).toEqual(['l1', 'l2'])
    expect(r.totalCobrar).toBe(200)
    expect(r.totalPagar).toBe(0)
    expect(r.netoTotal).toBe(200)
    expect(r.peopleOwingMe).toBe(1)
    expect(r.peopleIOwe).toBe(0)
  })

  it('subtracts payments from the remaining balance', () => {
    const l = loan({ id: 'l1', name: 'Beto', amount: 500 })
    const payments: Record<string, LoanPayment[]> = {
      l1: [{ id: 'p1', loan_id: 'l1', user_id: ME, amount: 200, note: null, created_at: '2026-06-05T00:00:00Z' }],
    }
    const r = derivePeopleBalances(input({ active: [l], paymentsByLoan: payments }))
    expect(r.entries[0].net).toBe(300)
  })

  it('groups contacts case-insensitively and trims', () => {
    const r = derivePeopleBalances(
      input({ active: [loan({ id: 'l1', name: 'Ana' }), loan({ id: 'l2', name: '  ana ' })] }),
    )
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].count).toBe(2)
  })

  // The regression that made settled loans unreachable: a contact whose loans
  // are all paid produced no entry at all, so their history vanished.
  it('keeps an entry for a contact whose loans are all settled', () => {
    const p = loan({ id: 'l1', name: 'Caro', amount: 100, paid_at: '2026-06-10T00:00:00Z' })
    const r = derivePeopleBalances(input({ active: [], paid: [p] }))

    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].name).toBe('Caro')
    expect(r.entries[0].net).toBe(0)
    expect(r.entries[0].loans).toHaveLength(0)
    expect(r.entries[0].paidLoans.map((l) => l.id)).toEqual(['l1'])
  })

  it('carries both open and settled loans for the same contact', () => {
    const open = loan({ id: 'l1', name: 'Dani', amount: 50 })
    const done = loan({ id: 'l2', name: 'Dani', amount: 90, paid_at: '2026-06-09T00:00:00Z' })
    const r = derivePeopleBalances(input({ active: [open], paid: [done] }))

    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].loans.map((l) => l.id)).toEqual(['l1'])
    expect(r.entries[0].paidLoans.map((l) => l.id)).toEqual(['l2'])
    expect(r.entries[0].net).toBe(50)
  })

  it('sorts creditors first, then by magnitude', () => {
    const r = derivePeopleBalances(
      input({
        active: [
          loan({ id: 'l1', name: 'Poco', amount: 10 }),
          loan({ id: 'l2', name: 'Mucho', amount: 900 }),
          loan({ id: 'l3', name: 'Debo', amount: 400, direction: 'i_owe' }),
        ],
      }),
    )
    expect(r.entries.map((e) => e.name)).toEqual(['Mucho', 'Poco', 'Debo'])
    expect(r.totalCobrar).toBe(910)
    expect(r.totalPagar).toBe(400)
    expect(r.netoTotal).toBe(510)
    expect(r.peopleIOwe).toBe(1)
  })

  it('never reports a settled contact as owing anything', () => {
    const r = derivePeopleBalances(
      input({ paid: [loan({ id: 'l1', name: 'Caro', amount: 100, paid_at: '2026-06-10T00:00:00Z' })] }),
    )
    expect(r.peopleOwingMe).toBe(0)
    expect(r.peopleIOwe).toBe(0)
    expect(r.netoTotal).toBe(0)
  })
})
