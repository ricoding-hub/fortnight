/**
 * Budget plan helpers — port of design_handoff_fortnight_redesign/design-files/planificacion.jsx.
 *
 * `bucketStats` computes plan vs real for one bucket. Items carry their own
 * `spent` (filled either from a real-spending hook in PR-6 or 0 by default).
 */

import type { BucketWithItems, BudgetItem, PlanPreset } from '@/types'

export interface BucketStats {
  /** Planned monthly amount = monthlyIncome × bucket.pct / 100. */
  planAmount: number
  /** Real spent within the current cycle. */
  spent: number
  /** spent − planAmount (positive = over budget). */
  diff: number
  /** Clamped spent / planAmount, 0..1.5. Useful for bar widths. */
  ratio: number
  /** Sum of item pct — should match bucket.pct when integrity is intact. */
  itemsPlanPct: number
}

/** A budget item with its real-cycle spend attached. */
export interface ItemWithSpend extends BudgetItem {
  spent: number
  /** True when the user marked the item as paid for the current cycle. */
  completed?: boolean
  /** Marker that this item's spent value comes from the subscriptions table. */
  auto_from_subscriptions?: boolean
  /** True if the item can be toggled "paid" — only fixed or auto-sub items. */
  completable?: boolean
  /** True when `spent` came from a manual user override (replaces transactions). */
  manual_override?: boolean
}

/** A bucket with items that include spend — what bucketStats consumes. */
export interface BucketWithSpend extends BucketWithItems {
  items: ItemWithSpend[]
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

export function bucketStats(
  bucket: BucketWithSpend,
  monthlyIncome: number,
): BucketStats {
  const itemsPlanPct = bucket.items.reduce((s, it) => s + it.pct, 0)
  const planAmount = (monthlyIncome * bucket.pct) / 100
  const spent = bucket.items.reduce((s, it) => s + (it.spent ?? 0), 0)
  const diff = spent - planAmount
  const ratio = planAmount > 0 ? clamp(spent / planAmount, 0, 1.5) : 0
  return { planAmount, spent, diff, ratio, itemsPlanPct }
}

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

/** Named presets only — Personal is a separate snapshot, not iterated here. */
export const PRESETS: Record<NamedPreset, { label: string; values: [number, number, number] }> = {
  '50-30-20': { label: '50/30/20', values: [50, 30, 20] },
  '70-20-10': { label: '70/20/10', values: [70, 20, 10] },
  'agresivo': { label: '40/20/40', values: [40, 20, 40] },
}

export type NamedPreset = Exclude<PlanPreset, 'personal'>

export function isNamedPreset(p: string): p is NamedPreset {
  return p === '50-30-20' || p === '70-20-10' || p === 'agresivo'
}

/**
 * Scales each bucket's pct (and its items' pct proportionally) to match a preset.
 * Returns new bucket+item shapes ready to persist.
 */
export function applyPreset(
  buckets: BucketWithItems[],
  preset: NamedPreset,
): BucketWithItems[] {
  const values = PRESETS[preset].values
  return buckets.map((b, i) => {
    const nextPct = values[i] ?? b.pct
    const scale = b.pct > 0 ? nextPct / b.pct : 1
    return {
      ...b,
      pct: nextPct,
      items: b.items.map((it) => ({ ...it, pct: Math.round(it.pct * scale) })),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Default seed — first-render initialiser                             */
/* ------------------------------------------------------------------ */

/** Default 50/30/20 plan + items shipped to new users on first Plan visit. */
export const DEFAULT_BUCKETS_SEED = [
  {
    slug: 'needs',
    name: 'Necesidades',
    pct: 50,
    color: '#2A4BFF',
    soft_color: '#E2E7FF',
    sort_order: 0,
    items: [
      { slug: 'rent',  name: 'Renta',      pct: 25, icon: 'rent',  category_name: 'Renta',      sort_order: 0 },
      { slug: 'food',  name: 'Despensa',   pct: 13, icon: 'food',  category_name: 'Comida',     sort_order: 1 },
      { slug: 'util',  name: 'Servicios',  pct: 7,  icon: 'bolt',  category_name: 'Servicios',  sort_order: 2 },
      { slug: 'trans', name: 'Transporte', pct: 5,  icon: 'car',   category_name: 'Transporte', sort_order: 3 },
    ],
  },
  {
    slug: 'wants',
    name: 'Estilo de vida',
    pct: 30,
    color: '#FFB59E',
    soft_color: '#FFE7DD',
    sort_order: 1,
    items: [
      { slug: 'exp',  name: 'Experiencias',  pct: 12, icon: 'sparkles', category_name: 'Social',        sort_order: 0 },
      { slug: 'out',  name: 'Comida fuera',  pct: 8,  icon: 'food',     category_name: 'Comida',        sort_order: 1 },
      { slug: 'shop', name: 'Compras',       pct: 7,  icon: 'card',     category_name: 'Otros',         sort_order: 2 },
      { slug: 'sub',  name: 'Suscripciones', pct: 3,  icon: 'sparkles', category_name: 'Suscripciones', sort_order: 3 },
    ],
  },
  {
    slug: 'save',
    name: 'Ahorro',
    pct: 20,
    color: '#2BB673',
    soft_color: '#D7F2E4',
    sort_order: 2,
    items: [
      { slug: 'goal', name: 'Meta corto plazo', pct: 10, icon: 'target', category_name: null, sort_order: 0 },
      { slug: 'emrg', name: 'Fondo emergencia', pct: 7,  icon: 'shield', category_name: null, sort_order: 1 },
      { slug: 'inv',  name: 'Inversión',        pct: 3,  icon: 'rocket', category_name: null, sort_order: 2 },
    ],
  },
] as const

/* ------------------------------------------------------------------ */
/* Bucket pct integrity                                                */
/* ------------------------------------------------------------------ */

/** Sum of bucket.pct across the plan — should equal 100 for a balanced plan. */
export function planIntegrityPct(buckets: BucketWithItems[]): number {
  return Math.round(buckets.reduce((s, b) => s + b.pct, 0))
}
