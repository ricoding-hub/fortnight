import { differenceInCalendarDays } from 'date-fns'

/**
 * Days from today until the next occurrence of `dayOfMonth` (1–31).
 * If the day already passed this month, it rolls to next month. The target
 * is clamped to the last valid day of the resolved month, so day 31 in a
 * 30-day month resolves to the 30th.
 *
 * Returns 0 when `dayOfMonth` is today.
 */
export function daysUntilDayOfMonth(
  dayOfMonth: number,
  from: Date = new Date(),
): number {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())

  const resolve = (year: number, month: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate()
    return new Date(year, month, Math.min(dayOfMonth, lastDay))
  }

  let target = resolve(today.getFullYear(), today.getMonth())
  if (target < today) {
    target = resolve(today.getFullYear(), today.getMonth() + 1)
  }
  return differenceInCalendarDays(target, today)
}
