import { describe, expect, it } from 'vitest'
import { buildLoanFlow, type LoanFlowInputs } from '@/lib/loanFlow'
import type { Loan, LoanPayment, SplitExpense, SplitExpenseShare, SplitSettlement } from '@/types'

const NOW = new Date(2026, 6, 6) // 6 jul 2026 → window feb..jul

function loan(overrides: Partial<Loan>): Loan {
  return {
    id: 'l1',
    user_id: 'u',
    name: 'Karla',
    amount: 100,
    notes: null,
    direction: 'owed_to_me',
    created_at: '2026-05-10T00:00:00Z',
    paid_at: null,
    group_id: null,
    ...overrides,
  }
}

function payment(loanId: string, amount: number, created_at: string): LoanPayment {
  return { id: `p-${created_at}`, loan_id: loanId, user_id: 'u', amount, note: null, created_at }
}

function expense(overrides: Partial<SplitExpense>): SplitExpense {
  return {
    id: 'e1',
    group_id: 'g1',
    user_id: 'u',
    description: 'Cena',
    amount: 300,
    paid_by_member_id: 'me',
    split_method: 'equal',
    account_id: null,
    expense_date: '2026-06-15',
    created_at: '2026-06-15T00:00:00Z',
    ...overrides,
  }
}

function share(expenseId: string, memberId: string, amount: number): SplitExpenseShare {
  return {
    id: `sh-${memberId}`,
    expense_id: expenseId,
    member_id: memberId,
    user_id: 'u',
    amount,
    weight: null,
    group_id: 'g1',
    created_at: '',
  }
}

function settlement(overrides: Partial<SplitSettlement>): SplitSettlement {
  return {
    id: 's1',
    group_id: 'g1',
    user_id: 'u',
    from_member_id: 'other',
    to_member_id: 'me',
    amount: 50,
    note: null,
    account_id: null,
    created_at: '2026-06-20T00:00:00Z',
    ...overrides,
  }
}

function inputs(partial: Partial<LoanFlowInputs>): LoanFlowInputs {
  return {
    loans: [],
    paymentsByLoan: {},
    expenses: [],
    sharesByExpense: new Map(),
    settlements: [],
    myMemberIds: new Set(['me']),
    now: NOW,
    months: 6,
    ...partial,
  }
}

describe('buildLoanFlow', () => {
  it('returns the requested number of months with zeros when idle', () => {
    const flow = buildLoanFlow(inputs({}))
    expect(flow).toHaveLength(6)
    expect(flow[5].month).toBe('jul')
    expect(flow[0].month).toBe('feb')
    for (const p of flow) {
      expect(p.prestado).toBe(0)
      expect(p.recuperado).toBe(0)
      expect(p.pendiente).toBe(0)
    }
  })

  it('a loan lends in its month and abonos recover later', () => {
    const l = loan({ created_at: '2026-05-10T00:00:00Z', amount: 100 })
    const flow = buildLoanFlow(
      inputs({
        loans: [l],
        paymentsByLoan: { l1: [payment('l1', 40, '2026-06-05T00:00:00Z')] },
      }),
    )
    const may = flow.find((p) => p.month === 'may')!
    const jun = flow.find((p) => p.month === 'jun')!
    expect(may.prestado).toBe(100)
    expect(may.pendiente).toBe(100)
    expect(jun.recuperado).toBe(40)
    expect(jun.pendiente).toBe(60)
  })

  it('loan and abono in the same month net out in pendiente', () => {
    const l = loan({ created_at: '2026-06-01T00:00:00Z', amount: 100 })
    const flow = buildLoanFlow(
      inputs({
        loans: [l],
        paymentsByLoan: { l1: [payment('l1', 100, '2026-06-20T00:00:00Z')] },
      }),
    )
    const jun = flow.find((p) => p.month === 'jun')!
    expect(jun.prestado).toBe(100)
    expect(jun.recuperado).toBe(100)
    expect(jun.pendiente).toBe(0)
  })

  it('shared expense I paid lends total minus my share', () => {
    const e = expense({ amount: 300 })
    const shares = new Map([
      ['e1', [share('e1', 'me', 100), share('e1', 'a', 100), share('e1', 'b', 100)]],
    ])
    const flow = buildLoanFlow(inputs({ expenses: [e], sharesByExpense: shares }))
    const jun = flow.find((p) => p.month === 'jun')!
    expect(jun.prestado).toBe(200)
    expect(jun.pendiente).toBe(200)
  })

  it('shared expense someone else paid adds my share as owed (reduces pendiente)', () => {
    const e = expense({ paid_by_member_id: 'other', amount: 300 })
    const shares = new Map([['e1', [share('e1', 'me', 100), share('e1', 'other', 200)]]])
    const flow = buildLoanFlow(inputs({ expenses: [e], sharesByExpense: shares }))
    const jun = flow.find((p) => p.month === 'jun')!
    expect(jun.prestado).toBe(0)
    expect(jun.pendiente).toBe(-100)
  })

  it('settlements received recover; settlements paid raise my net', () => {
    const recv = settlement({ amount: 50, created_at: '2026-06-20T00:00:00Z' })
    const paid = settlement({
      id: 's2',
      from_member_id: 'me',
      to_member_id: 'other',
      amount: 30,
      created_at: '2026-07-01T00:00:00Z',
    })
    const flow = buildLoanFlow(inputs({ settlements: [recv, paid] }))
    const jun = flow.find((p) => p.month === 'jun')!
    const jul = flow.find((p) => p.month === 'jul')!
    expect(jun.recuperado).toBe(50)
    expect(jun.pendiente).toBe(-50)
    expect(jul.pendiente).toBe(-20)
  })

  it('carries pre-window history into the opening pendiente', () => {
    const old = loan({ id: 'l0', created_at: '2025-11-01T00:00:00Z', amount: 500 })
    const flow = buildLoanFlow(inputs({ loans: [old] }))
    expect(flow[0].prestado).toBe(0) // outside the window
    expect(flow[0].pendiente).toBe(500) // but the debt carries in
  })

  it('i_owe loans lower pendiente without counting as prestado', () => {
    const l = loan({ direction: 'i_owe', created_at: '2026-06-01T00:00:00Z', amount: 80 })
    const flow = buildLoanFlow(
      inputs({ loans: [l], paymentsByLoan: { l1: [payment('l1', 30, '2026-07-01T00:00:00Z')] } }),
    )
    const jun = flow.find((p) => p.month === 'jun')!
    const jul = flow.find((p) => p.month === 'jul')!
    expect(jun.prestado).toBe(0)
    expect(jun.pendiente).toBe(-80)
    expect(jul.pendiente).toBe(-50) // my repayment reduces what I owe
  })
})
