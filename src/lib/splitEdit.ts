import type { SplitExpense, SplitExpenseShare, SplitMethod } from '@/types'

export interface EditFormState {
  method: SplitMethod
  /** memberId → raw input string (pct / parts / exact pesos, per method). */
  inputs: Record<string, string>
  /** memberIds participating (meaningful for 'equal'). */
  participantIds: string[]
}

/**
 * Reconstruct the expense form state from a stored expense + its shares,
 * so the edit modal opens exactly as the expense was captured:
 * - equal:      participants = members with a share row
 * - percentage: inputs from the stored weight (pct)
 * - shares:     inputs from the stored weight (parts)
 * - exact:      inputs from each share amount in pesos
 */
export function buildEditInputs(
  expense: Pick<SplitExpense, 'split_method'>,
  shares: ReadonlyArray<Pick<SplitExpenseShare, 'member_id' | 'amount' | 'weight'>>,
): EditFormState {
  const method = expense.split_method
  const inputs: Record<string, string> = {}
  const participantIds: string[] = []

  for (const sh of shares) {
    participantIds.push(sh.member_id)
    if (method === 'percentage' || method === 'shares') {
      inputs[sh.member_id] = sh.weight != null ? String(Number(sh.weight)) : ''
    } else if (method === 'exact') {
      inputs[sh.member_id] = String(Number(sh.amount))
    }
  }

  return { method, inputs, participantIds }
}
