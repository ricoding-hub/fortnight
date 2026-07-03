import { describe, expect, it } from 'vitest'
import {
  computeShares,
  memberNets,
  simplifyDebts,
  loanNetForContact,
  toCents,
  SplitValidationError,
  type ExpenseForNet,
  type SettlementForNet,
} from '@/lib/split'
import type { Loan, LoanPayment } from '@/types'

const A = 'member-a'
const B = 'member-b'
const C = 'member-c'
const D = 'member-d'

function sumShares(shares: Map<string, number>): number {
  return [...shares.values()].reduce((s, v) => s + v, 0)
}

/* ─────────────────────────── computeShares ── */

describe('computeShares — equal', () => {
  it('splits 100.00 among 3 with exact centavo distribution', () => {
    const shares = computeShares(10000, 'equal', [{ memberId: A }, { memberId: B }, { memberId: C }])
    expect([...shares.values()].sort((a, b) => b - a)).toEqual([3334, 3333, 3333])
    expect(sumShares(shares)).toBe(10000)
    expect(shares.get(A)).toBe(3334) // first member gets the extra centavo
  })

  it('splits evenly when divisible', () => {
    const shares = computeShares(9000, 'equal', [{ memberId: A }, { memberId: B }, { memberId: C }])
    expect([...shares.values()]).toEqual([3000, 3000, 3000])
  })

  it('single member gets the whole total', () => {
    const shares = computeShares(12345, 'equal', [{ memberId: A }])
    expect(shares.get(A)).toBe(12345)
  })

  it('rejects zero and negative totals', () => {
    expect(() => computeShares(0, 'equal', [{ memberId: A }])).toThrow(SplitValidationError)
    expect(() => computeShares(-100, 'equal', [{ memberId: A }])).toThrow(SplitValidationError)
  })

  it('rejects an empty member list', () => {
    expect(() => computeShares(1000, 'equal', [])).toThrow(SplitValidationError)
  })
})

describe('computeShares — percentage', () => {
  it('handles 33.33/33.33/33.34 without drifting', () => {
    const shares = computeShares(10000, 'percentage', [
      { memberId: A, weight: 33.33 },
      { memberId: B, weight: 33.33 },
      { memberId: C, weight: 33.34 },
    ])
    expect(sumShares(shares)).toBe(10000)
    expect(shares.get(C)).toBe(3334)
  })

  it('fixes naive rounding drift via largest remainder', () => {
    // 100.01 at 1/3 each: raw = 3333.666… → floors lose 2 centavos
    const shares = computeShares(10001, 'percentage', [
      { memberId: A, weight: 33.34 },
      { memberId: B, weight: 33.33 },
      { memberId: C, weight: 33.33 },
    ])
    expect(sumShares(shares)).toBe(10001)
  })

  it('throws when percentages do not sum to 100', () => {
    expect(() =>
      computeShares(10000, 'percentage', [
        { memberId: A, weight: 50 },
        { memberId: B, weight: 40 },
      ]),
    ).toThrow(SplitValidationError)
  })

  it('allows a member with 0%', () => {
    const shares = computeShares(10000, 'percentage', [
      { memberId: A, weight: 100 },
      { memberId: B, weight: 0 },
    ])
    expect(shares.get(A)).toBe(10000)
    expect(shares.get(B)).toBe(0)
  })
})

describe('computeShares — shares (parts)', () => {
  it('splits 100.00 by 1:2:3 parts', () => {
    const shares = computeShares(10000, 'shares', [
      { memberId: A, weight: 1 },
      { memberId: B, weight: 2 },
      { memberId: C, weight: 3 },
    ])
    expect(sumShares(shares)).toBe(10000)
    expect(shares.get(A)).toBe(1667)
    expect(shares.get(B)).toBe(3333)
    expect(shares.get(C)).toBe(5000)
  })

  it('throws when all weights are zero', () => {
    expect(() =>
      computeShares(1000, 'shares', [
        { memberId: A, weight: 0 },
        { memberId: B, weight: 0 },
      ]),
    ).toThrow(SplitValidationError)
  })

  it('throws on negative weights', () => {
    expect(() =>
      computeShares(1000, 'shares', [
        { memberId: A, weight: -1 },
        { memberId: B, weight: 2 },
      ]),
    ).toThrow(SplitValidationError)
  })
})

describe('computeShares — exact', () => {
  it('accepts amounts that sum exactly', () => {
    const shares = computeShares(10000, 'exact', [
      { memberId: A, exactCents: 7000 },
      { memberId: B, exactCents: 3000 },
    ])
    expect(shares.get(A)).toBe(7000)
    expect(shares.get(B)).toBe(3000)
  })

  it('throws with the residual when the sum mismatches', () => {
    try {
      computeShares(10000, 'exact', [
        { memberId: A, exactCents: 7000 },
        { memberId: B, exactCents: 2000 },
      ])
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(SplitValidationError)
      expect((e as SplitValidationError).residualCents).toBe(-1000)
    }
  })

  it('allows a member with exact 0', () => {
    const shares = computeShares(5000, 'exact', [
      { memberId: A, exactCents: 5000 },
      { memberId: B, exactCents: 0 },
    ])
    expect(shares.get(B)).toBe(0)
  })
})

/* ─────────────────────────── memberNets ── */

describe('memberNets', () => {
  it('computes nets for expenses where the payer also participates', () => {
    // A pays 90.00 split equally among A, B, C → A is owed 60, B and C owe 30 each
    const shares = computeShares(9000, 'equal', [{ memberId: A }, { memberId: B }, { memberId: C }])
    const expenses: ExpenseForNet[] = [{ paidByMemberId: A, totalCents: 9000, shares }]
    const nets = memberNets([A, B, C], expenses, [])
    expect(nets.get(A)).toBe(6000)
    expect(nets.get(B)).toBe(-3000)
    expect(nets.get(C)).toBe(-3000)
    expect([...nets.values()].reduce((s, v) => s + v, 0)).toBe(0)
  })

  it('applies settlements to reduce debt', () => {
    const shares = computeShares(9000, 'equal', [{ memberId: A }, { memberId: B }, { memberId: C }])
    const expenses: ExpenseForNet[] = [{ paidByMemberId: A, totalCents: 9000, shares }]
    const settlements: SettlementForNet[] = [{ fromMemberId: B, toMemberId: A, amountCents: 3000 }]
    const nets = memberNets([A, B, C], expenses, settlements)
    expect(nets.get(A)).toBe(3000)
    expect(nets.get(B)).toBe(0)
    expect(nets.get(C)).toBe(-3000)
  })

  it('combines legacy loan nets with expenses', () => {
    const legacy = new Map([[A, 5000], [B, -5000]])
    const shares = computeShares(2000, 'equal', [{ memberId: A }, { memberId: B }])
    const expenses: ExpenseForNet[] = [{ paidByMemberId: B, totalCents: 2000, shares }]
    const nets = memberNets([A, B], expenses, [], legacy)
    expect(nets.get(A)).toBe(4000)  // 5000 − 1000 owed
    expect(nets.get(B)).toBe(-4000) // −5000 + 2000 paid − 1000 owed
  })

  it('settled group nets to zero everywhere', () => {
    const shares = computeShares(6000, 'equal', [{ memberId: A }, { memberId: B }])
    const expenses: ExpenseForNet[] = [{ paidByMemberId: A, totalCents: 6000, shares }]
    const settlements: SettlementForNet[] = [{ fromMemberId: B, toMemberId: A, amountCents: 3000 }]
    const nets = memberNets([A, B], expenses, settlements)
    expect(nets.get(A)).toBe(0)
    expect(nets.get(B)).toBe(0)
  })
})

/* ─────────────────────────── simplifyDebts ── */

function applyTransfers(nets: Map<string, number>, transfers: ReturnType<typeof simplifyDebts>) {
  const result = new Map(nets)
  for (const t of transfers) {
    result.set(t.fromMemberId, (result.get(t.fromMemberId) ?? 0) + t.amountCents)
    result.set(t.toMemberId, (result.get(t.toMemberId) ?? 0) - t.amountCents)
  }
  return result
}

describe('simplifyDebts', () => {
  it('textbook 3-person case settles in ≤ 2 transfers', () => {
    const nets = new Map([[A, 6000], [B, -3000], [C, -3000]])
    const transfers = simplifyDebts(nets)
    expect(transfers.length).toBeLessThanOrEqual(2)
    const after = applyTransfers(nets, transfers)
    for (const v of after.values()) expect(v).toBe(0)
  })

  it('already-settled group returns no transfers', () => {
    expect(simplifyDebts(new Map([[A, 0], [B, 0]]))).toEqual([])
    expect(simplifyDebts(new Map())).toEqual([])
  })

  it('single creditor vs many debtors', () => {
    const nets = new Map([[A, 10000], [B, -2000], [C, -3000], [D, -5000]])
    const transfers = simplifyDebts(nets)
    expect(transfers.length).toBe(3) // N−1
    expect(transfers.every((t) => t.toMemberId === A)).toBe(true)
    const after = applyTransfers(nets, transfers)
    for (const v of after.values()) expect(v).toBe(0)
  })

  it('single debtor vs many creditors', () => {
    const nets = new Map([[A, -10000], [B, 2000], [C, 3000], [D, 5000]])
    const transfers = simplifyDebts(nets)
    expect(transfers.length).toBe(3)
    expect(transfers.every((t) => t.fromMemberId === A)).toBe(true)
    const after = applyTransfers(nets, transfers)
    for (const v of after.values()) expect(v).toBe(0)
  })

  it('absorbs a ±1 centavo residual from external float math', () => {
    const nets = new Map([[A, 5000], [B, -2500], [C, -2501]]) // sums to −1
    const transfers = simplifyDebts(nets)
    const totalMoved = transfers.reduce((s, t) => s + t.amountCents, 0)
    expect(totalMoved).toBeGreaterThan(0)
    expect(transfers.length).toBeLessThanOrEqual(2)
  })

  it('throws when the residual exceeds 1 centavo', () => {
    expect(() => simplifyDebts(new Map([[A, 5000], [B, -3000]]))).toThrow(SplitValidationError)
  })

  it('never emits more than N−1 transfers (random-ish property check)', () => {
    // deterministic pseudo-random nets that sum to zero
    const cases = [
      [1234, -1234],
      [500, 700, -1200],
      [10000, -1, -9999],
      [333, 333, 334, -1000],
      [25000, -12500, -6250, -6250],
    ]
    for (const nets of cases) {
      const map = new Map(nets.map((c, i) => [`m${i}`, c]))
      const transfers = simplifyDebts(map)
      expect(transfers.length).toBeLessThanOrEqual(nets.length - 1)
      const after = applyTransfers(map, transfers)
      for (const v of after.values()) expect(v).toBe(0)
    }
  })

  it('is deterministic across calls', () => {
    const nets = new Map([[A, 3000], [B, 3000], [C, -3000], [D, -3000]])
    const t1 = simplifyDebts(nets)
    const t2 = simplifyDebts(nets)
    expect(t1).toEqual(t2)
  })
})

/* ─────────────────────────── loanNetForContact ── */

function loan(overrides: Partial<Loan>): Loan {
  return {
    id: 'l1',
    user_id: 'u',
    name: 'Karla',
    amount: 100,
    notes: null,
    direction: 'owed_to_me',
    created_at: '',
    paid_at: null,
    group_id: null,
    ...overrides,
  }
}

function payment(loanId: string, amount: number): LoanPayment {
  return { id: crypto.randomUUID(), loan_id: loanId, user_id: 'u', amount, note: null, created_at: '' }
}

describe('loanNetForContact', () => {
  it('owed_to_me counts positive for me, net of payments', () => {
    const loans = [loan({ id: 'l1', amount: 100 })]
    const { myNetCents, contactNetCents } = loanNetForContact(loans, { l1: [payment('l1', 30)] })
    expect(myNetCents).toBe(7000)
    expect(contactNetCents).toBe(-7000)
  })

  it('i_owe counts negative for me', () => {
    const loans = [loan({ id: 'l1', amount: 50, direction: 'i_owe' })]
    const { myNetCents } = loanNetForContact(loans, {})
    expect(myNetCents).toBe(-5000)
  })

  it('ignores settled loans and mixes directions', () => {
    const loans = [
      loan({ id: 'l1', amount: 100 }),                                  // +100
      loan({ id: 'l2', amount: 40, direction: 'i_owe' }),               // −40
      loan({ id: 'l3', amount: 999, paid_at: '2026-01-01T00:00:00Z' }), // ignored
    ]
    const { myNetCents } = loanNetForContact(loans, {})
    expect(myNetCents).toBe(6000)
  })

  it('overpaid loan floors at zero', () => {
    const loans = [loan({ id: 'l1', amount: 100 })]
    const { myNetCents } = loanNetForContact(loans, { l1: [payment('l1', 150)] })
    expect(myNetCents).toBe(0)
  })
})

/* ─────────────────────────── toCents boundary ── */

describe('toCents', () => {
  it('rounds float artifacts correctly', () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(33.335)).toBe(3334)
    expect(toCents(100)).toBe(10000)
  })
})
