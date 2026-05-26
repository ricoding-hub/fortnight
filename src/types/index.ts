// Fortnight — domain types.
// Mirrors the Supabase schema (CLAUDE.md / supabase/migrations/001_initial.sql).

export type AccountType = 'debit' | 'credit'
export type TransactionType = 'transaction' | 'adjustment' | 'sync'
export type CategoryKind = 'fixed' | 'variable' | 'income'
export type DataSource = 'manual' | 'syncfy'
export type SyncfyStatus =
  | 'active'
  | 'token_expired'
  | 'login_required'
  | 'payment_required'
  | 'disabled'
  | 'error'

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
  /**
   * Days after cut date when payment is due (e.g. 60 for Plata Card).
   * When set, takes precedence over payment_due_day. Credit accounts only.
   */
  payment_grace_days: number | null
  color: string | null
  /** Optional bank domain (e.g. "santander.com.mx") for favicon-based logo display. */
  logo_domain: string | null
  /** Numeric sort key; lower = first. Null = sorts after explicit values. */
  sort_order: number | null
  created_at: string
  updated_at: string
  /** 'manual' (default) or 'syncfy' for accounts imported via the bank-aggregation widget. */
  source: DataSource
  syncfy_credential_id: string | null
  /** Syncfy's id_account when source='syncfy'; used for dedupe. */
  external_id: string | null
  institution_name: string | null
  last_synced_at: string | null
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
  source: DataSource
  /** Syncfy's id_transaction when source='syncfy'; null for manual entries. */
  external_id: string | null
}

export interface SyncfyCredential {
  id: string
  user_id: string
  syncfy_id_credential: string
  syncfy_id_user: string
  institution_name: string
  institution_code: string | null
  status: SyncfyStatus
  last_status_message: string | null
  last_synced_at: string | null
  last_sync_accounts: number | null
  last_sync_transactions: number | null
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

export type PlanPreset = '50-30-20' | '70-20-10' | 'agresivo' | 'personal'

export interface PersonalSnapshot {
  buckets: Array<{
    slug: string
    pct: number
    items: Array<{ slug: string; pct: number }>
  }>
}

export interface BudgetPlan {
  id: string
  user_id: string
  preset: PlanPreset | string
  updated_at: string
  created_at: string
  /** User-editable label for their personalised preset. */
  personal_name: string | null
  /** Snapshot of the user's custom bucket/item percentages. Null until first edit. */
  personal_snapshot: PersonalSnapshot | null
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
  /** User marks one goal as the "principal" goal — shown first everywhere. */
  is_primary: boolean
  /** ISO date string — when the goal/contributions started. */
  started_at: string
  created_at: string
  /** Accounts whose balances back this goal. Derived from `goal_accounts`. */
  linked_account_ids: string[]
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
  /** Global email notification opt-out (added in migration 007). */
  notif_email: boolean
  /** UI preference — render the floating Richeto companion. */
  pet_floating: boolean
}

export interface UserGamification {
  user_id: string
  xp: number
  level: number
  streak_days: number
  last_activity_date: string | null
  updated_at: string
}

export type SubscriptionFrequency = 'mensual' | 'trimestral' | 'anual'

export interface Subscription {
  id: string
  user_id: string
  account_id: string | null
  name: string
  amount: number
  frequency: SubscriptionFrequency
  charge_day: number
  category_id: string | null
  brand_id: string | null
  color: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type NewSubscription = Omit<Subscription, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type SubscriptionPatch = Partial<NewSubscription>

export type NotificationType = 'payment_due' | 'payday' | 'goal' | 'mission'

export interface ScoreSnapshot {
  user_id: string
  /** ISO date 'YYYY-MM-DD'. */
  day: string
  score: number
  utilization: number | null
  liquidity: number | null
  savings_rate: number | null
  streak_days: number | null
  budget_adherence: number | null
  recorded_at: string
}

export interface MissionCompletion {
  id: string
  user_id: string
  mission_id: string
  /** ISO week — 'YYYY-Www'. */
  cycle_week: string
  reward_xp: number
  claimed_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  account_id: string | null
  dedup_key: string
  email_sent: boolean
  created_at: string
}
