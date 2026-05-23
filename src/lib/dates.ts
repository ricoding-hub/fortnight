import { differenceInCalendarDays } from 'date-fns'
import type { Account } from '@/types'

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

/**
 * Days until the next payment for a credit account.
 *
 * - When payment_grace_days + cut_day are both set: the due date is
 *   cut_date + payment_grace_days (handles variable-month billing like Plata).
 * - Otherwise falls back to payment_due_day (fixed day of month).
 * - Returns null when no payment date is configured, or for debit accounts.
 */
export function daysUntilPayment(account: Account, from: Date = new Date()): number | null {
  if (account.type !== 'credit') return null

  const { cut_day, payment_grace_days, payment_due_day } = account

  if (payment_grace_days != null && cut_day != null) {
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const clampDay = (y: number, m: number) => {
      const last = new Date(y, m + 1, 0).getDate()
      return new Date(y, m, Math.min(cut_day, last))
    }
    // Find the most recent past cut date
    let lastCut = clampDay(today.getFullYear(), today.getMonth())
    if (lastCut > today) {
      lastCut =
        today.getMonth() === 0
          ? clampDay(today.getFullYear() - 1, 11)
          : clampDay(today.getFullYear(), today.getMonth() - 1)
    }
    const due = new Date(lastCut)
    due.setDate(due.getDate() + payment_grace_days)
    // If due date has already passed this cycle, advance to next cut cycle
    if (due < today) {
      const nextCut = clampDay(today.getFullYear(), today.getMonth() + 1)
      const nextDue = new Date(nextCut)
      nextDue.setDate(nextDue.getDate() + payment_grace_days)
      return differenceInCalendarDays(nextDue, today)
    }
    return differenceInCalendarDays(due, today)
  }

  if (payment_due_day != null) {
    return daysUntilDayOfMonth(payment_due_day, from)
  }

  return null
}
