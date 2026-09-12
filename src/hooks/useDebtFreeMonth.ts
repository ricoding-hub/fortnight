import { useMemo } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { useGoals } from '@/hooks/useGoals'
import { useMonthlyDisposable } from '@/hooks/useMonthlyDisposable'
import { debtFreeMonth, resolveDebtGoal } from '@/lib/goals'
import type { Goal } from '@/types'

export interface DebtFreeMonth {
  /** The month the debt hits zero, or null when it can't be known. */
  month: Date | null
  /** The contribution the month was computed from. */
  monthly: number
  /** The goal with live numbers substituted, for charts that need the series. */
  goal: Goal | null
  /** True when `monthly` is the user's disposable rather than a stored figure. */
  isDerived: boolean
  /** Why there's no month, so the UI can say something useful. */
  reason: 'no-goal' | 'no-disposable' | null
  loading: boolean
}

/**
 * The single source for "mes libre de deuda".
 *
 * Home and Proyección used to compute this separately and disagreed: Home
 * divided by the goal's stored `monthly`, Proyección by the live disposable.
 * Worse, the stored figure comes from a goal the app seeds itself as
 * `deuda × 1.05 ÷ 6` — put that through `monthsToGoal` and the debt cancels
 * out, so every user got exactly six months no matter what they owed. Both
 * screens read this hook now, which is what keeps them from drifting again.
 */
export function useDebtFreeMonth(): DebtFreeMonth {
  const { data: goals, loading: goalsLoading } = useGoals()
  const { data: accounts, loading: accountsLoading } = useAccounts()
  const { disposable } = useMonthlyDisposable()

  const primary = useMemo(
    () => goals.find((g) => g.is_primary) ?? goals.find((g) => g.is_debt) ?? null,
    [goals],
  )

  const creditDebt = useMemo(
    () => accounts.filter((a) => a.type === 'credit').reduce((s, a) => s + Number(a.balance), 0),
    [accounts],
  )

  return useMemo(() => {
    const loading = goalsLoading || accountsLoading
    if (!primary) {
      return { month: null, monthly: 0, goal: null, isDerived: false, reason: 'no-goal' as const, loading }
    }
    const resolved = resolveDebtGoal(primary, { creditDebt, disposable })
    if (!resolved) {
      return { month: null, monthly: 0, goal: null, isDerived: false, reason: 'no-disposable' as const, loading }
    }
    return {
      month: debtFreeMonth(resolved),
      monthly: resolved.monthly,
      goal: resolved,
      isDerived: resolved.monthly !== primary.monthly,
      reason: null,
      loading,
    }
  }, [primary, creditDebt, disposable, goalsLoading, accountsLoading])
}
