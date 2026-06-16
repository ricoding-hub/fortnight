import { addMonths, format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Account, Installment } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommittedPoint {
  month: string
  msi: number
  revolving: number
  total: number
}

export interface ColchonPoint {
  month: string
  colchon: number
  committed: number
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/** Principal still owed on an installment plan. */
export function getInstallmentRemaining(inst: Installment): number {
  return (inst.months_total - inst.months_paid) * inst.monthly_amount
}

/**
 * Revolving (interest-accruing) portion of a credit card balance.
 * = bank balance − Σ MSI principal pending for this account.
 * Result is clamped to ≥ 0: if MSI principal exceeds balance the card is in a
 * prepaid state which is captured by prepay_buffer instead.
 */
export function getRevolvingBalance(account: Account, installments: Installment[]): number {
  if (account.type !== 'credit') return 0
  const msiForAccount = installments.filter(
    (i) => i.account_id === account.id && i.status === 'active',
  )
  const msiPrincipal = msiForAccount.reduce((s, i) => s + getInstallmentRemaining(i), 0)
  return Math.max(0, account.balance - msiPrincipal)
}

/**
 * Minimum payment due this cycle for a single credit account.
 * = min-revolving-payment + Σ MSI monthly amounts − prepay buffer used.
 * Result is clamped to ≥ 0 (buffer can make it $0).
 */
export function getExigibleEsteCiclo(account: Account, installments: Installment[]): number {
  if (account.type !== 'credit') return 0
  const revolvingBal = getRevolvingBalance(account, installments)
  const pct = account.min_payment_pct ?? 1.5
  const minRevolving =
    account.cost_type === 'con_costo' ? Math.max(0, revolvingBal) * (pct / 100) : 0

  const activeForAccount = installments.filter(
    (i) => i.account_id === account.id && i.status === 'active',
  )
  const msiMonthly = activeForAccount.reduce((s, i) => s + i.monthly_amount, 0)
  const bufferUsed = Math.min(account.prepay_buffer, msiMonthly)
  return Math.max(0, minRevolving + msiMonthly - bufferUsed)
}

/**
 * Total monthly payment due across all credit accounts.
 * Used as the Resumen hero "A pagar este mes".
 */
export function getTotalExigible(accounts: Account[], installments: Installment[]): number {
  return accounts
    .filter((a) => a.type === 'credit')
    .reduce((s, a) => s + getExigibleEsteCiclo(a, installments), 0)
}

/**
 * 18-month series of committed monthly payments (MSI + min-revolving).
 * The series steps down as MSI plans finish — useful for the compromisos bar chart.
 *
 * @param installments - All installment records (any status)
 * @param accounts     - All account records
 * @param horizon      - Number of months ahead to project (default 18)
 * @param now          - Reference date (default today)
 */
export function getMensualidadesComprometidas(
  installments: Installment[],
  accounts: Account[],
  horizon = 18,
  now: Date = new Date(),
): CommittedPoint[] {
  const creditAccounts = accounts.filter((a) => a.type === 'credit')

  // Flat min-revolving for con_costo accounts (MVP: treat as constant)
  const flatRevolving = creditAccounts
    .filter((a) => a.cost_type === 'con_costo')
    .reduce((s, a) => {
      const pct = a.min_payment_pct ?? 1.5
      return s + getRevolvingBalance(a, installments) * (pct / 100)
    }, 0)

  const activeInstallments = installments.filter((i) => i.status === 'active')

  const points: CommittedPoint[] = []
  for (let m = 0; m < horizon; m++) {
    const label = format(addMonths(now, m), 'LLL', { locale: es })
    // An installment is still active in month M if months_remaining > M
    const msi = activeInstallments
      .filter((i) => i.months_total - i.months_paid > m)
      .reduce((s, i) => s + i.monthly_amount, 0)

    points.push({ month: label, msi, revolving: flatRevolving, total: msi + flatRevolving })
  }
  return points
}

/**
 * Monthly "breathing room" = disposable gross income − committed payments.
 * Grows each month as MSI plans finish.
 *
 * `disposableGross` should be the current disposable *before* subtracting MSI monthly amounts,
 * i.e. `disposable + installmentsMonthly` from Proyeccion.tsx.
 */
export function getColchonReal(
  disposableGross: number,
  committed: CommittedPoint[],
): ColchonPoint[] {
  return committed.map((c) => ({
    month: c.month,
    colchon: disposableGross - c.total,
    committed: c.total,
  }))
}

/**
 * How many future months the prepay_buffer on a given account covers its MSI monthly total.
 * Returns null if there are no active MSI plans for this account.
 */
export function prepayMonthsCovered(account: Account, installments: Installment[]): number | null {
  if (account.prepay_buffer <= 0) return null
  const msiMonthly = installments
    .filter((i) => i.account_id === account.id && i.status === 'active')
    .reduce((s, i) => s + i.monthly_amount, 0)
  if (msiMonthly <= 0) return null
  return Math.floor(account.prepay_buffer / msiMonthly)
}
