import type { Account } from '@/types'

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/**
 * Financial health score, 1–10. Blends two ratios (see CLAUDE.md):
 *  - Credit utilization: credit debt ÷ credit limits (lower is better)
 *  - Liquidity: debit cash ÷ credit debt (higher is better)
 *
 * Utilization carries more weight as it climbs — a maxed-out card is the
 * more urgent signal than a thin cash cushion.
 */
export function calculateScore(accounts: Account[]): number {
  const credit = accounts.filter((a) => a.type === 'credit')
  const debit = accounts.filter((a) => a.type === 'debit')

  const creditDebt = credit.reduce((sum, a) => sum + a.balance, 0)
  const creditLimit = credit.reduce((sum, a) => sum + (a.credit_limit ?? 0), 0)
  const debitTotal = debit.reduce((sum, a) => sum + a.balance, 0)

  // No credit lines: nothing to over-leverage — score on cash on hand alone.
  if (credit.length === 0) return debitTotal > 0 ? 9 : 6

  // 0 used -> 10, fully maxed -> 0. Missing limits count as fully used.
  const utilization = creditLimit > 0 ? clamp(creditDebt / creditLimit, 0, 1) : 1
  const utilizationScore = (1 - utilization) * 10

  // Debit cash fully covers the debt -> 10, no cash against debt -> 0.
  const liquidity = creditDebt > 0 ? debitTotal / creditDebt : 1
  const liquidityScore = clamp(liquidity, 0, 1) * 10

  // Utilization weight rises 0.55 -> 0.75 as the cards fill up.
  const utilizationWeight = 0.55 + utilization * 0.2
  const liquidityWeight = 1 - utilizationWeight

  const score =
    utilizationScore * utilizationWeight + liquidityScore * liquidityWeight
  return clamp(Math.round(score), 1, 10)
}
