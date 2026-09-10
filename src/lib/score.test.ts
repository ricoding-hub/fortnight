import { describe, expect, it } from 'vitest'
import { calculateScore, calculateScoreV2, weeklyScoreDelta } from '@/lib/score'
import type { Account, ScoreSnapshot } from '@/types'

function debit(balance: number): Account {
  return {
    id: crypto.randomUUID(),
    user_id: 'u',
    name: 'Debit',
    type: 'debit',
    balance,
    credit_limit: null,
    cut_day: null,
    payment_due_day: null,
    payment_grace_days: null,
    color: null,
    logo_domain: null,
    sort_order: null,
    created_at: '',
    updated_at: '',
    source: 'manual',
    syncfy_credential_id: null,
    external_id: null,
    institution_name: null,
    last_synced_at: null,
    cost_type: 'con_costo',
    apr: null,
    min_payment_pct: null,
    prepay_buffer: 0,
  }
}

function credit(balance: number, limit: number | null = null): Account {
  return {
    ...debit(balance),
    type: 'credit',
    credit_limit: limit,
  }
}

describe('calculateScoreV2', () => {
  it('returns a neutral mid-range score with no signals at all', () => {
    const { score } = calculateScoreV2({ accounts: [] })
    expect(score).toBeGreaterThanOrEqual(1)
    expect(score).toBeLessThanOrEqual(10)
  })

  it('hits near 10 with cash, no debt, full streak, savings, on-plan', () => {
    const { score } = calculateScoreV2({
      accounts: [debit(50000)],
      streakDays: 30,
      monthlyIncome: 30000,
      monthlyExpense: 18000,
      budgetSpendRatio: 1,
    })
    expect(score).toBeGreaterThanOrEqual(9)
  })

  it('drops sharply when cards are maxed out', () => {
    const { score: maxed } = calculateScoreV2({
      accounts: [debit(1000), credit(50000, 50000)],
      streakDays: 7,
    })
    const { score: clear } = calculateScoreV2({
      accounts: [debit(1000), credit(0, 50000)],
      streakDays: 7,
    })
    expect(clear).toBeGreaterThan(maxed)
  })

  it('treats missing credit limits as fully used (worst case)', () => {
    const { breakdown: known } = calculateScoreV2({
      accounts: [credit(5000, 20000)],
    })
    const { breakdown: missing } = calculateScoreV2({
      accounts: [credit(5000, null)],
    })
    expect(known.utilization).toBeGreaterThan(missing.utilization)
  })

  it('rewards a streak of 3 weeks with full streak credit', () => {
    const { breakdown } = calculateScoreV2({
      accounts: [debit(1)],
      streakDays: 21,
    })
    expect(breakdown.streak).toBe(1)
  })

  it('caps savings rate at 40%', () => {
    const { breakdown: fourty } = calculateScoreV2({
      accounts: [debit(1)],
      monthlyIncome: 10000,
      monthlyExpense: 6000,
    })
    const { breakdown: sixty } = calculateScoreV2({
      accounts: [debit(1)],
      monthlyIncome: 10000,
      monthlyExpense: 4000,
    })
    expect(fourty.savingsRate).toBe(1)
    expect(sixty.savingsRate).toBe(1)
  })

  it('penalises spending over the budget plan', () => {
    const { breakdown: onPlan } = calculateScoreV2({
      accounts: [debit(1)],
      budgetSpendRatio: 1,
    })
    const { breakdown: doubled } = calculateScoreV2({
      accounts: [debit(1)],
      budgetSpendRatio: 2,
    })
    expect(onPlan.budgetAdherence).toBe(1)
    expect(doubled.budgetAdherence).toBe(0)
  })

  it('never returns NaN even with zero income and zero spend', () => {
    const { score } = calculateScoreV2({
      accounts: [debit(0)],
      monthlyIncome: 0,
      monthlyExpense: 0,
    })
    expect(Number.isFinite(score)).toBe(true)
  })

  it('rounds to one decimal place', () => {
    const { score } = calculateScoreV2({ accounts: [debit(1000)] })
    expect(score * 10).toBeCloseTo(Math.round(score * 10), 5)
  })
})

describe('calculateScore (legacy adapter)', () => {
  it('still returns an integer in 1..10', () => {
    const s = calculateScore([debit(500), credit(2000, 10000)])
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(1)
    expect(s).toBeLessThanOrEqual(10)
  })
})

describe('weeklyScoreDelta', () => {
  // El hook los entrega del más reciente al más antiguo.
  const snap = (day: string, score: number) => ({ day, score } as ScoreSnapshot)
  const MONDAY = '2026-09-07'

  it('measures against where the week opened, not against the sparkline', () => {
    const history = [
      snap('2026-09-09', 4.2),
      snap('2026-09-07', 4.0),
      snap('2026-09-06', 3.5), // domingo: cierre de la semana pasada
      snap('2026-08-20', 8.0), // dentro del sparkline de 30 días, fuera de la semana
    ]
    // 4.5 hoy contra 3.5 al cerrar el domingo — el 8.0 de agosto no participa.
    expect(weeklyScoreDelta(history, 4.5, MONDAY)).toBe(1)
  })

  it('falls back to the oldest reading inside the week for a new user', () => {
    const history = [snap('2026-09-09', 4.2), snap('2026-09-08', 3.0)]
    expect(weeklyScoreDelta(history, 3.6, MONDAY)).toBe(0.6)
  })

  it('returns null when there is nothing to compare against', () => {
    expect(weeklyScoreDelta([], 5, MONDAY)).toBeNull()
  })

  it('reports a drop as negative', () => {
    expect(weeklyScoreDelta([snap('2026-09-06', 6)], 4.5, MONDAY)).toBe(-1.5)
  })

  it('rounds to one decimal, like the label shows it', () => {
    expect(weeklyScoreDelta([snap('2026-09-06', 3.33)], 4.0, MONDAY)).toBe(0.7)
  })

  it('handles the numeric strings Postgres returns for numeric columns', () => {
    const history = [{ day: '2026-09-06', score: '3.5' } as unknown as ScoreSnapshot]
    expect(weeklyScoreDelta(history, 4.5, MONDAY)).toBe(1)
  })
})
