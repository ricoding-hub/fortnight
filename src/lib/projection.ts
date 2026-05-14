import { addMonths, format } from 'date-fns'
import { es } from 'date-fns/locale'

export interface DebtPoint {
  /** Short month label for a chart axis, e.g. "may", "jun". */
  month: string
  /** Projected total credit debt at the end of that month. */
  debt: number
}

// Guard against runaway series when the monthly payment barely dents the debt.
const MAX_MONTHS = 120

/**
 * Projects credit debt month by month, subtracting `monthlyAvailable` each
 * step (see CLAUDE.md projection logic). The first point is today's debt; the
 * series ends the month debt reaches 0.
 *
 * Returns just the starting point when no progress is possible
 * (`monthlyAvailable <= 0`) or when there is no debt to begin with.
 */
export function projectDebtPayoff(
  totalDebt: number,
  monthlyAvailable: number,
  startDate: Date = new Date(),
): DebtPoint[] {
  const label = (offset: number) =>
    format(addMonths(startDate, offset), 'LLL', { locale: es })

  let debt = Math.max(0, totalDebt)
  const points: DebtPoint[] = [{ month: label(0), debt }]

  if (monthlyAvailable <= 0 || debt === 0) return points

  let month = 0
  while (debt > 0 && month < MAX_MONTHS) {
    month += 1
    debt = Math.max(0, debt - monthlyAvailable)
    points.push({ month: label(month), debt })
  }
  return points
}
