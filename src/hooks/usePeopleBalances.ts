import { useMemo } from 'react'
import { derivePeopleBalances, type BalancesInput } from '@/lib/peopleBalances'

export type { BalanceEntry, PeopleBalances, BalancesInput } from '@/lib/peopleBalances'

/**
 * Single source of truth for the per-person / per-group loan+split balances
 * shown on Home and in Préstamos. Pure derivation — the caller owns the data
 * subscriptions (`useLoans` + `useSplitGroups`) and passes the pieces in.
 *
 * Each entry carries its underlying loans so every screen can drill into a
 * single loan without re-deriving the grouping.
 */
export function usePeopleBalances(input: BalancesInput) {
  const { active, paid, paymentsByLoan, splitGroups, profiles, displayName, userId } = input
  return useMemo(
    () => derivePeopleBalances({ active, paid, paymentsByLoan, splitGroups, profiles, displayName, userId }),
    [active, paid, paymentsByLoan, splitGroups, profiles, displayName, userId],
  )
}
