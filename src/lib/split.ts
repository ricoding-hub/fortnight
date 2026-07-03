import type { Loan, LoanPayment } from '@/types'

/* ─────────────────────────────────────────────────────────────
 * Mini-split: pure money math in integer centavos.
 * Convert at the boundary only: toCents / fromCents.
 * Invariant everywhere: shares always sum EXACTLY to the total.
 * ──────────────────────────────────────────────────────────── */

export type SplitMethod = 'equal' | 'percentage' | 'exact' | 'shares'

export class SplitValidationError extends Error {
  /** Residual in centavos (input − expected) when applicable. */
  readonly residualCents: number

  constructor(message: string, residualCents = 0) {
    super(message)
    this.name = 'SplitValidationError'
    this.residualCents = residualCents
  }
}

export function toCents(n: number): number {
  return Math.round(n * 100)
}

export function fromCents(c: number): number {
  return c / 100
}

export interface ShareInput {
  memberId: string
  /** Percentage (0–100) for 'percentage', parts for 'shares'. Ignored otherwise. */
  weight?: number
  /** Exact amount in centavos for 'exact'. Ignored otherwise. */
  exactCents?: number
}

/**
 * Distribute `totalCents` among members according to the split method.
 * Largest-remainder rounding: floors every raw share, then hands leftover
 * centavos one by one to members with the biggest fractional part
 * (ties broken by input order). Guarantees Σ shares === totalCents.
 */
export function computeShares(
  totalCents: number,
  method: SplitMethod,
  members: ShareInput[],
): Map<string, number> {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new SplitValidationError('El total debe ser un entero de centavos mayor a 0')
  }
  if (members.length === 0) {
    throw new SplitValidationError('Se necesita al menos un miembro')
  }

  const out = new Map<string, number>()

  if (method === 'equal') {
    const n = members.length
    const base = Math.floor(totalCents / n)
    const leftover = totalCents - base * n
    members.forEach((m, i) => out.set(m.memberId, base + (i < leftover ? 1 : 0)))
    return out
  }

  if (method === 'exact') {
    let sum = 0
    for (const m of members) {
      const c = m.exactCents ?? 0
      if (!Number.isInteger(c) || c < 0) {
        throw new SplitValidationError('Los montos exactos deben ser centavos enteros ≥ 0')
      }
      sum += c
    }
    if (sum !== totalCents) {
      throw new SplitValidationError(
        `Los montos exactos no suman el total (diferencia de ${fromCents(sum - totalCents)})`,
        sum - totalCents,
      )
    }
    members.forEach((m) => out.set(m.memberId, m.exactCents ?? 0))
    return out
  }

  // percentage | shares — proportional with largest-remainder distribution
  let raws: number[]
  if (method === 'percentage') {
    const totalPct = members.reduce((s, m) => s + (m.weight ?? 0), 0)
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new SplitValidationError(
        `Los porcentajes deben sumar 100 (suman ${totalPct})`,
        toCents(totalPct - 100),
      )
    }
    raws = members.map((m) => (totalCents * (m.weight ?? 0)) / 100)
  } else {
    const totalWeight = members.reduce((s, m) => s + (m.weight ?? 0), 0)
    if (totalWeight <= 0) {
      throw new SplitValidationError('Las partes deben sumar más de 0')
    }
    for (const m of members) {
      if ((m.weight ?? 0) < 0) {
        throw new SplitValidationError('Las partes no pueden ser negativas')
      }
    }
    raws = members.map((m) => (totalCents * (m.weight ?? 0)) / totalWeight)
  }

  const floors = raws.map(Math.floor)
  let leftover = totalCents - floors.reduce((s, f) => s + f, 0)
  const order = raws
    .map((raw, i) => ({ i, frac: raw - Math.floor(raw) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (leftover <= 0) break
    floors[i] += 1
    leftover -= 1
  }
  members.forEach((m, i) => out.set(m.memberId, floors[i]))
  return out
}

/* ─────────────────────────────── member nets ── */

export interface ExpenseForNet {
  paidByMemberId: string
  totalCents: number
  /** memberId → owed share in centavos. */
  shares: ReadonlyMap<string, number> | Map<string, number>
}

export interface SettlementForNet {
  fromMemberId: string
  toMemberId: string
  amountCents: number
}

/**
 * Net balance per member in centavos. Positive = creditor (is owed),
 * negative = debtor. Sums to zero across the group by construction
 * (legacy nets are the caller's responsibility to keep zero-sum).
 */
export function memberNets(
  memberIds: readonly string[],
  expenses: readonly ExpenseForNet[],
  settlements: readonly SettlementForNet[],
  legacyNets?: ReadonlyMap<string, number>,
): Map<string, number> {
  const nets = new Map<string, number>()
  for (const id of memberIds) nets.set(id, legacyNets?.get(id) ?? 0)

  const add = (id: string, delta: number) => {
    nets.set(id, (nets.get(id) ?? 0) + delta)
  }

  for (const e of expenses) {
    add(e.paidByMemberId, e.totalCents)
    for (const [memberId, share] of e.shares) add(memberId, -share)
  }
  for (const s of settlements) {
    add(s.fromMemberId, s.amountCents)
    add(s.toMemberId, -s.amountCents)
  }
  return nets
}

/* ─────────────────────────── debt simplification ── */

export interface Transfer {
  fromMemberId: string
  toMemberId: string
  amountCents: number
}

/**
 * Greedy optimal settlement: repeatedly match the largest creditor with the
 * largest debtor. Every iteration zeroes at least one party, so the result
 * has at most N−1 transfers. Deterministic: ties broken by member id.
 *
 * A residual of ±1 centavo (possible when legacy nets come from float math)
 * is absorbed into the largest |net| so the group still settles exactly.
 */
export function simplifyDebts(nets: ReadonlyMap<string, number>): Transfer[] {
  const entries = [...nets.entries()].filter(([, c]) => c !== 0)
  const residual = entries.reduce((s, [, c]) => s + c, 0)
  if (residual !== 0) {
    if (Math.abs(residual) > 1) {
      throw new SplitValidationError(
        `Los netos no suman cero (residuo ${fromCents(residual)})`,
        residual,
      )
    }
    // absorb ±1 centavo into the largest absolute net
    let maxIdx = 0
    for (let i = 1; i < entries.length; i++) {
      if (Math.abs(entries[i][1]) > Math.abs(entries[maxIdx][1])) maxIdx = i
    }
    if (entries.length === 0) return []
    entries[maxIdx] = [entries[maxIdx][0], entries[maxIdx][1] - residual]
  }

  const creditors = entries
    .filter(([, c]) => c > 0)
    .map(([id, c]) => ({ id, cents: c }))
  const debtors = entries
    .filter(([, c]) => c < 0)
    .map(([id, c]) => ({ id, cents: -c }))

  const byAmountDesc = (a: { id: string; cents: number }, b: { id: string; cents: number }) =>
    b.cents - a.cents || (a.id < b.id ? -1 : 1)

  const transfers: Transfer[] = []
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountDesc)
    debtors.sort(byAmountDesc)
    const c = creditors[0]
    const d = debtors[0]
    const x = Math.min(c.cents, d.cents)
    transfers.push({ fromMemberId: d.id, toMemberId: c.id, amountCents: x })
    c.cents -= x
    d.cents -= x
    if (c.cents === 0) creditors.shift()
    if (d.cents === 0) debtors.shift()
  }
  return transfers
}

/* ─────────────────────────── legacy loans adapter ── */

/**
 * Net in centavos that a group's legacy 1:1 loans contribute, from MY
 * perspective: 'owed_to_me' remaining counts positive for me (they owe me),
 * 'i_owe' counts negative. Returns { myNet, contactNet } where
 * contactNet === −myNet so the pair stays zero-sum inside the group.
 */
export function loanNetForContact(
  loans: readonly Loan[],
  paymentsByLoan: Readonly<Record<string, LoanPayment[]>>,
): { myNetCents: number; contactNetCents: number } {
  let my = 0
  for (const loan of loans) {
    if (loan.paid_at) continue
    // Same semantics as loanRemaining() in useLoans: amount − Σ payments, floored at 0.
    const paid = (paymentsByLoan[loan.id] ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const remaining = toCents(Math.max(0, Number(loan.amount) - paid))
    my += loan.direction === 'owed_to_me' ? remaining : -remaining
  }
  return { myNetCents: my, contactNetCents: -my }
}
