import type { Loan, LoanPayment, SplitExpense, SplitExpenseShare, SplitSettlement } from '@/types'

/* ─────────────────────────────────────────────────────────────
 * Monthly lending flow for the loans analytics chart:
 * how much I lend vs recover each month, and the running amount
 * still owed to me at each month's close.
 * ──────────────────────────────────────────────────────────── */

export interface LoanFlowPoint {
  /** Short month label, e.g. "ene", "feb". */
  month: string
  /** New money lent this month (loans to others + my covered share of group expenses). */
  prestado: number
  /** Money recovered this month (abonos on owed_to_me loans + settlements received). */
  recuperado: number
  /** Net still owed to me at month close (cumulative prestado − recuperado − lo que debo). */
  pendiente: number
}

export interface LoanFlowInputs {
  loans: readonly Loan[]
  paymentsByLoan: Readonly<Record<string, LoanPayment[]>>
  /** Shared expenses across my groups. */
  expenses: readonly SplitExpense[]
  /** expense_id → shares. */
  sharesByExpense: ReadonlyMap<string, SplitExpenseShare[]>
  settlements: readonly SplitSettlement[]
  /** My member ids across all groups (payer / settlement matching). */
  myMemberIds: ReadonlySet<string>
  /** Reference date (injected — no Date.now inside the lib). */
  now: Date
  months?: number
}

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function monthKey(iso: string): string {
  return iso.slice(0, 7) // YYYY-MM
}

/**
 * Build the last-N-months lending flow. The `pendiente` line is a true
 * running ledger: it accumulates ALL history (also before the window) so
 * the first visible month already carries prior outstanding debt.
 */
export function buildLoanFlow(inputs: LoanFlowInputs): LoanFlowPoint[] {
  const months = inputs.months ?? 6
  const keys: string[] = []
  const base = new Date(inputs.now.getFullYear(), inputs.now.getMonth(), 1)
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const windowStart = keys[0]

  const lent = new Map<string, number>()
  const recovered = new Map<string, number>()
  // Signed ledger deltas per month for the pendiente line (+ = they owe me more).
  const netDelta = new Map<string, number>()

  const add = (map: Map<string, number>, key: string, v: number) => {
    map.set(key, (map.get(key) ?? 0) + v)
  }

  // Loans: creation lends (owed_to_me) or borrows (i_owe).
  for (const loan of inputs.loans) {
    const k = monthKey(loan.created_at)
    const amount = Number(loan.amount)
    if (loan.direction === 'owed_to_me') {
      add(lent, k, amount)
      add(netDelta, k, amount)
    } else {
      add(netDelta, k, -amount)
    }
    // Payments: recovering (owed_to_me) or repaying (i_owe).
    for (const p of inputs.paymentsByLoan[loan.id] ?? []) {
      const pk = monthKey(p.created_at)
      const pAmount = Number(p.amount)
      if (loan.direction === 'owed_to_me') {
        add(recovered, pk, pAmount)
        add(netDelta, pk, -pAmount)
      } else {
        add(netDelta, pk, pAmount)
      }
    }
  }

  // Shared expenses: when I pay, I lend (total − my share); when someone
  // else pays, I owe my share.
  for (const e of inputs.expenses) {
    const k = monthKey(e.expense_date)
    const total = Number(e.amount)
    const shares = inputs.sharesByExpense.get(e.id) ?? []
    const myShare = shares
      .filter((s) => inputs.myMemberIds.has(s.member_id))
      .reduce((sum, s) => sum + Number(s.amount), 0)
    if (inputs.myMemberIds.has(e.paid_by_member_id)) {
      const lentOut = total - myShare
      if (lentOut > 0) {
        add(lent, k, lentOut)
        add(netDelta, k, lentOut)
      }
    } else if (myShare > 0) {
      add(netDelta, k, -myShare)
    }
  }

  // Settlements: receiving recovers; paying reduces what I owe.
  for (const s of inputs.settlements) {
    const k = monthKey(s.created_at)
    const amount = Number(s.amount)
    if (inputs.myMemberIds.has(s.to_member_id)) {
      add(recovered, k, amount)
      add(netDelta, k, -amount)
    } else if (inputs.myMemberIds.has(s.from_member_id)) {
      add(netDelta, k, amount)
    }
  }

  // Carry pre-window history into the opening balance.
  let running = 0
  for (const [k, v] of netDelta) {
    if (k < windowStart) running += v
  }

  return keys.map((k) => {
    running += netDelta.get(k) ?? 0
    const [, mm] = k.split('-')
    return {
      month: MONTH_LABELS[Number(mm) - 1],
      prestado: Math.round((lent.get(k) ?? 0) * 100) / 100,
      recuperado: Math.round((recovered.get(k) ?? 0) * 100) / 100,
      pendiente: Math.round(running * 100) / 100,
    }
  })
}
