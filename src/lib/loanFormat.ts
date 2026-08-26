import { formatDateGroupMX } from '@/lib/format'
import type { Loan, LoanPayment, SplitMember } from '@/types'

/**
 * Shared loan display helpers. These used to live inside MisPrestamos; the
 * loans UI is now split across Home, the loans list and the group detail, so
 * all three read them from here.
 */

/** Whole-peso display for KPIs and card nets — decimals looked broken there. */
export function fmtCompact(n: number): string {
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${Math.round(abs).toLocaleString('es-MX')}`
}

/** "Saldado el …" / "Último abono …" / "Desde el …" */
export function loanDateHint(loan: Loan, payments: LoanPayment[]): string {
  if (loan.paid_at) return `Saldado el ${formatDateGroupMX(loan.paid_at)}`
  const last = payments[payments.length - 1]
  if (last) return `Último abono ${formatDateGroupMX(last.created_at)}`
  return `Desde el ${formatDateGroupMX(loan.created_at)}`
}

/** Sort key: most recent activity (settled date, last payment, or creation). */
export function loanActivityKey(loan: Loan, payments: LoanPayment[]): string {
  const lastPay = payments.length > 0 ? payments[payments.length - 1].created_at : ''
  return loan.paid_at ?? (lastPay > loan.created_at ? lastPay : loan.created_at)
}

/**
 * Remaining balance on a loan after partial payments. Computed in integer
 * centavos (matching the settle/waterfall math in useSplitGroups, which sums
 * `toCents` per payment) so the amount shown never disagrees with the amount
 * actually settled by a centavo.
 */
export function loanRemaining(loan: Loan, payments: LoanPayment[]): number {
  const paidCents = payments.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0)
  const amountCents = Math.round(Number(loan.amount) * 100)
  return Math.max(0, (amountCents - paidCents) / 100)
}

/**
 * Is this member me? A joined member's row has `is_me = false` — only
 * `member_user_id` identifies them, so check the link first.
 */
export function memberIsMe(m: SplitMember, userId: string | undefined): boolean {
  if (!userId) return false
  if (m.member_user_id != null) return m.member_user_id === userId
  return m.is_me
}
