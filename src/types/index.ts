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

export type PayFreq = 'semanal' | 'catorcenal' | 'quincenal' | 'mensual'

/* ------------------------------------------------------------------ */
/* Plan module — budget plan + buckets + items + goals                 */
/* ------------------------------------------------------------------ */

export type PlanPreset = '50-30-20' | '70-20-10' | 'agresivo'

export interface BudgetPlan {
  id: string
  user_id: string
  preset: PlanPreset | string
  updated_at: string
  created_at: string
}

export interface BudgetBucket {
  id: string
  plan_id: string
  /** Stable identifier — 'needs' | 'wants' | 'save'. */
  slug: string
  name: string
  pct: number
  color: string
  soft_color: string
  sort_order: number
}

export interface BudgetItem {
  id: string
  bucket_id: string
  slug: string
  name: string
  pct: number
  category_id: string | null
  /** Stable icon key — see src/lib/icons.ts for the mapping. */
  icon: string | null
  sort_order: number
}

/** A bucket joined with its items — what the UI normally consumes. */
export interface BucketWithItems extends BudgetBucket {
  items: BudgetItem[]
}

export interface Goal {
  id: string
  user_id: string
  name: string
  /** Stable icon key — see src/lib/icons.ts. */
  icon: string | null
  color: string | null
  target: number
  saved: number
  monthly: number
  /** ISO date string. */
  deadline: string | null
  is_debt: boolean
  /** ISO date string — when the goal/contributions started. */
  started_at: string
  created_at: string
}

export interface UserConfig {
  user_id: string
  /** Net biweekly pay — legacy field, kept for the Proyección projection logic. */
  catorcena: number
  /** Food vouchers per biweekly period. */
  vales: number
  /** Estimated fixed monthly expenses. */
  fixed_monthly: number
  /** Estimated variable monthly expenses. */
  variable_monthly: number
  next_pay_date: string | null
  updated_at: string
  /** Pay cycle (added in migration 004_profile.sql). */
  pay_freq: PayFreq
  /** Net pay per cycle. */
  pay_amount: number
  /** Last known payday — anchor for `computePaydays`. */
  pay_reference: string | null
  /** Notification toggles. */
  notif_payday: boolean
  notif_due_card: boolean
  notif_mission: boolean
  notif_goal: boolean
  /** UI preference — render the floating Richeto companion. */
  pet_floating: boolean
}
