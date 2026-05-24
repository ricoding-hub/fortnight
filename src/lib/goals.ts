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

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

/**
 * Month-by-month projection of `value`. For debt goals: decreases from target
 * toward 0. For savings: increases from saved toward target. Series stops once
 * the goal is hit and is capped at 8 months for the chart.
 */
export function projectGoal(goal: Goal, today: Date = new Date()): ProjectionPoint[] {
  const remaining = Math.max(goal.target - goal.saved, 0)
  if (goal.monthly <= 0) return []
  const months = Math.ceil(remaining / goal.monthly)
  const len = Math.min(months + 1, 8)
  const out: ProjectionPoint[] = []
  for (let i = 0; i < len; i++) {
    const monthIdx = (today.getMonth() + i) % 12
    const value = goal.is_debt
      ? Math.max(remaining - i * goal.monthly, 0)
      : Math.min(goal.saved + i * goal.monthly, goal.target)
    out.push({ month: MONTHS_ES[monthIdx], value })
  }
  return out
}

/**
 * Months remaining to hit the goal at the current `monthly` contribution.
 */
export function monthsToGoal(goal: Goal): number {
  if (goal.monthly <= 0) return Infinity
  const remaining = Math.max(goal.target - goal.saved, 0)
  return Math.ceil(remaining / goal.monthly)
}
