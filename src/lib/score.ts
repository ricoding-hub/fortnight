import type { Account } from '@/types'

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/* ------------------------------------------------------------------ */
/* Score V2 — behaviour + balance-sheet blend                          */
/* ------------------------------------------------------------------ */

export interface ScoreInput {
  accounts: Account[]
  /** Streak length from `user_gamification.streak_days`. */
  streakDays?: number
  /** Sum of income transactions over the last 30 days (positive number). */
  monthlyIncome?: number
  /** Sum of expense transactions over the last 30 days (positive number). */
  monthlyExpense?: number
  /**
   * Ratio of actual spend to planned spend across the current budget cycle.
   * 0 = nothing spent, 1 = on plan, 2+ = double over. Null when no plan yet.
   */
  budgetSpendRatio?: number | null
}

export interface ScoreBreakdown {
  utilization: number
  liquidity: number
  savingsRate: number
  streak: number
  budgetAdherence: number
}

export interface ScoreResult {
  score: number
  breakdown: ScoreBreakdown
}

/**
 * Each signal is normalised to 0..1 (higher is better) and weighted.
 * Weights are inspired by FICO's payment-history / utilization split,
 * adapted to the signals we actually have:
 *
 *   utilization        0.30   debt ÷ limit
 *   liquidity          0.20   cash ÷ debt
 *   savings rate       0.20   (income − expense) ÷ income
 *   streak             0.15   daily activity over 3 weeks
 *   budget adherence   0.15   actual ÷ planned spend
 */
const WEIGHTS = {
  utilization: 0.30,
  liquidity: 0.20,
  savingsRate: 0.20,
  streak: 0.15,
  budgetAdherence: 0.15,
} as const

export function calculateScoreV2(input: ScoreInput): ScoreResult {
  const {
    accounts,
    streakDays = 0,
    monthlyIncome = 0,
    monthlyExpense = 0,
    budgetSpendRatio = null,
  } = input

  const credit = accounts.filter((a) => a.type === 'credit')
  const debit = accounts.filter((a) => a.type === 'debit')

  const creditDebt = credit.reduce((s, a) => s + Number(a.balance), 0)
  const creditLimit = credit.reduce(
    (s, a) => s + Number(a.credit_limit ?? 0),
    0,
  )
  const debitTotal = debit.reduce((s, a) => s + Number(a.balance), 0)

  // Utilization: 1 when no debt or no cards, 0 when fully maxed.
  // Missing limits count as fully used so we don't reward unknowns.
  let utilization: number
  if (credit.length === 0) {
    utilization = 1
  } else if (creditLimit <= 0) {
    utilization = 0
  } else {
    utilization = 1 - clamp(creditDebt / creditLimit, 0, 1)
  }

  // Liquidity: cash ÷ debt. No debt → fully liquid.
  const liquidity =
    creditDebt > 0 ? clamp(debitTotal / creditDebt, 0, 1) : 1

  // Savings rate: 40% saved → full credit, 0% → zero. No income → neutral.
  let savingsRate: number
  if (monthlyIncome <= 0) {
    savingsRate = 0.5
  } else {
    const rate = (monthlyIncome - monthlyExpense) / monthlyIncome
    savingsRate = clamp(rate, 0, 0.4) / 0.4
  }

  // Streak: 3 weeks of activity = full credit.
  const streak = clamp(streakDays / 21, 0, 1)

  // Budget adherence: 1.0 = on plan, 2.0 = double over. No plan → neutral.
  let budgetAdherence: number
  if (budgetSpendRatio === null || budgetSpendRatio === undefined) {
    budgetAdherence = 0.5
  } else {
    const over = Math.max(0, budgetSpendRatio - 1)
    budgetAdherence = 1 - clamp(over, 0, 1)
  }

  const weighted =
    utilization * WEIGHTS.utilization +
    liquidity * WEIGHTS.liquidity +
    savingsRate * WEIGHTS.savingsRate +
    streak * WEIGHTS.streak +
    budgetAdherence * WEIGHTS.budgetAdherence

  const score = Math.round(clamp(weighted * 10, 1, 10) * 10) / 10

  return {
    score,
    breakdown: { utilization, liquidity, savingsRate, streak, budgetAdherence },
  }
}

/**
 * Legacy adapter — callers that haven't been refactored yet still pass just
 * an `Account[]`. We fill in neutral defaults so the score still moves with
 * balance sheet changes, just without the behavioural signals.
 */
export function calculateScore(accounts: Account[]): number {
  const { score } = calculateScoreV2({ accounts })
  return Math.round(score)
}
