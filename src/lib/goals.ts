/**
 * Goal helpers — `expectedToday` (plan vs real), `monthsBetween`, and the
 * `projectGoal` series used by Plan/Proyección chart.
 */

import type { Goal } from '@/types'

/** Whole months elapsed between two ISO dates (or Date objects), >= 0. */
export function monthsBetween(from: string | Date, to: Date = new Date()): number {
  const a = typeof from === 'string' ? new Date(from + 'T12:00:00') : from
  if (isNaN(a.getTime())) return 0
  const years = to.getFullYear() - a.getFullYear()
  const months = to.getMonth() - a.getMonth()
  const dayDelta = to.getDate() - a.getDate()
  const elapsed = years * 12 + months + (dayDelta >= 0 ? 0 : -1)
  return Math.max(0, elapsed)
}

/**
 * "Where the user *should* be today" assuming they've been making `monthly`
 * contributions since `started_at`. Clamped to target.
 */
export function expectedToday(goal: Goal, today: Date = new Date()): number {
  const elapsed = monthsBetween(goal.started_at, today)
  return Math.min(elapsed * goal.monthly, goal.target)
}

export interface ProjectionPoint {
  month: string
  value: number
}

export const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

/**
 * Month-by-month projection of `value`. For debt goals: decreases from the
 * current remaining debt toward 0. For savings: increases from current saved
 * toward target. Series stops once the goal is hit and is capped at 8 months.
 *
 * `goal.saved` is the derived field from useGoals (= Σ linked account balances
 * for savings, or target − Σ credit balances for debt), so this stays accurate
 * with the user's real-world cash position.
 */
export function projectGoal(goal: Goal, today: Date = new Date()): ProjectionPoint[] {
  if (goal.monthly <= 0) return []
  const remaining = Math.max(goal.target - goal.saved, 0)
  const currentValue = goal.is_debt ? remaining : goal.saved
  const months = Math.ceil(remaining / goal.monthly)
  const len = Math.min(months + 1, 8)
  const out: ProjectionPoint[] = []
  for (let i = 0; i < len; i++) {
    const monthIdx = (today.getMonth() + i) % 12
    const value = goal.is_debt
      ? Math.max(currentValue - i * goal.monthly, 0)
      : Math.min(currentValue + i * goal.monthly, goal.target)
    out.push({ month: MONTHS_ES[monthIdx], value })
  }
  return out
}

/**
 * Months remaining to hit the goal at the current `monthly` contribution.
 * Uses `goal.saved` (already derived from linked accounts when present).
 */
export function monthsToGoal(goal: Goal): number {
  if (goal.monthly <= 0) return Infinity
  const remaining = Math.max(goal.target - goal.saved, 0)
  return Math.ceil(remaining / goal.monthly)
}

/* ── Mes libre de deuda ───────────────────────────────────────────────────── */

export interface DebtGoalInputs {
  /** Live credit-card debt to pay off. */
  creditDebt: number
  /** Live monthly disposable from the budget plan. */
  disposable: number
}

/**
 * The debt goal as it should actually be projected, with the user's live
 * numbers substituted for the stored ones.
 *
 * This replaces a calculation that lived inside the Proyección view while Home
 * projected the raw stored goal — which is how the two screens came to show
 * different months for the same user. It also stops the app inventing a date:
 * the goal the app seeds itself stores `monthly = deuda × 1.05 ÷ 6`, and
 * feeding that to `monthsToGoal` cancels the debt out —
 * `ceil(deuda / (deuda × 1.05 / 6))` is always 6, for anyone, at any debt. That
 * is why two people with different finances saw the same month. Falling back to
 * that stored figure would keep the fiction alive, so when there is no real
 * contribution to divide by, this returns null and the UI says so.
 *
 * A goal with linked accounts is left alone: there the user picked the
 * contribution and the accounts, and those are their data, not our guess.
 */
export function resolveDebtGoal(goal: Goal, { creditDebt, disposable }: DebtGoalInputs): Goal | null {
  if (!goal.is_debt || goal.linked_account_ids.length > 0) {
    return goal.monthly > 0 ? goal : null
  }
  if (disposable <= 0) return null
  return {
    ...goal,
    saved: Math.max(0, goal.target - creditDebt),
    monthly: disposable,
  }
}

/**
 * The month the debt reaches zero, or null when it can't be known.
 *
 * Deliberately not derived from the projection series: that one is capped at
 * eight points (`projectGoal`), so a payoff further out than seven months had
 * no zero bar to find and the headline fell back to a dash.
 */
export function debtFreeMonth(goal: Goal | null, today: Date = new Date()): Date | null {
  if (!goal) return null
  const months = monthsToGoal(goal)
  if (!Number.isFinite(months)) return null
  const d = new Date(today)
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  return d
}
