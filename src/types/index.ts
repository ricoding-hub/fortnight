// Fortnight — domain types.
// Mirrors the Supabase schema (CLAUDE.md / supabase/migrations/001_initial.sql).

export type AccountType = 'debit' | 'credit'
export type TransactionType = 'transaction' | 'adjustment'
export type CategoryKind = 'fixed' | 'variable' | 'income'

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  /** Always a positive number. For credit accounts, this is the debt amount. */
  balance: number
  /** Credit accounts only. */
  credit_limit: number | null
  /** Day of month 1–31. Credit accounts only. */
  cut_day: number | null
  /** Day of month 1–31. Credit accounts only. */
  payment_due_day: number | null
  color: string | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  /**
   * Signed amount.
   * Debit:  positive = deposit,  negative = expense.
   * Credit: positive = purchase (debt up), negative = payment (debt down).
   */
  amount: number
  category_id: string | null
  description: string | null
  date: string
  type: TransactionType
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  kind: CategoryKind
  /** Tabler icon name. */
  icon: string | null
  color: string | null
  created_at: string
}

export interface Loan {
  id: string
  user_id: string
  name: string
  amount: number
  notes: string | null
  created_at: string
  /** Null while active; timestamp once marked paid. */
  paid_at: string | null
}

export interface UserConfig {
  user_id: string
  /** Net biweekly pay. */
  catorcena: number
  /** Food vouchers per biweekly period. */
  vales: number
  /** Estimated fixed monthly expenses. */
  fixed_monthly: number
  /** Estimated variable monthly expenses. */
  variable_monthly: number
  next_pay_date: string | null
  updated_at: string
}
