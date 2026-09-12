import type { UserConfig, Subscription, Goal } from '@/types'

export interface ProjectionPoint {
  month: string
  value: number
}

const MONTH_NAMES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function monthLabel(offset: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return MONTH_NAMES[d.getMonth()]
}

/**
 * Equivalente mensual de un cargo según su periodicidad.
 *
 * `Number()` y no confiar en el tipo: `numeric` de Postgres llega como cadena, y
 * en el caso mensual esto devolvía el valor tal cual. Quien sumaba concatenaba —
 * 299 y 199 daban "0299199" — y sólo en mensual, que es el caso común, porque
 * anual y trimestral se salvaban por la división.
 */
export function subMonthlyAmount(amount: number, frequency: Subscription['frequency']): number {
  const n = Number(amount)
  if (!Number.isFinite(n)) return 0
  if (frequency === 'anual') return n / 12
  if (frequency === 'trimestral') return n / 3
  return n
}

/**
 * Net monthly disposable income after fixed costs and subscriptions.
 * Uses pay_amount + pay_freq to derive monthly income.
 */
export function calcMonthlyDisposable(
  config: Pick<UserConfig, 'pay_amount' | 'pay_freq' | 'fixed_monthly' | 'variable_monthly'>,
  subscriptions: Subscription[],
): number {
  const CYCLES: Record<string, number> = {
    semanal: 4,
    catorcenal: 2.17,
    quincenal: 2,
    mensual: 1,
  }
  const monthlyIncome = config.pay_amount * (CYCLES[config.pay_freq] ?? 2)
  const subTotal = subscriptions
    .filter((s) => s.active)
    .reduce((sum, s) => sum + subMonthlyAmount(s.amount, s.frequency), 0)
  return monthlyIncome - config.fixed_monthly - config.variable_monthly - subTotal
}

/**
 * Project month-by-month debt reduction starting from `creditDebt`.
 * Returns at most 36 points or until debt reaches 0.
 */
export function projectDebtPayoff(
  creditDebt: number,
  monthlyPayment: number,
  maxMonths = 36,
): ProjectionPoint[] {
  if (monthlyPayment <= 0 || creditDebt <= 0) return []
  const points: ProjectionPoint[] = []
  let remaining = creditDebt
  for (let i = 0; i < maxMonths; i++) {
    points.push({ month: monthLabel(i), value: Math.max(remaining, 0) })
    remaining -= monthlyPayment
    if (remaining <= 0) { points.push({ month: monthLabel(i + 1), value: 0 }); break }
  }
  return points
}

/**
 * Project month-by-month savings growth toward a goal's target.
 * Compatible with PlanChart (same ProjectionPoint shape used in goals.ts).
 */
export function projectGoalTimeline(goal: Goal, disposable: number): ProjectionPoint[] {
  const monthly = goal.monthly > 0 ? goal.monthly : Math.max(disposable, 0)
  if (goal.is_debt) return projectDebtPayoff(goal.target - goal.saved, monthly)
  const points: ProjectionPoint[] = []
  let saved = goal.saved
  for (let i = 0; i < 60; i++) {
    points.push({ month: monthLabel(i), value: Math.min(saved, goal.target) })
    if (saved >= goal.target) break
    saved += monthly
  }
  return points
}
