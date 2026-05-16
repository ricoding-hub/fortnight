import { describe, expect, it } from 'vitest'
import {
  applyPreset,
  bucketStats,
  DEFAULT_BUCKETS_SEED,
  planIntegrityPct,
  type BucketWithSpend,
} from './plan'

function makeBucket(overrides: Partial<BucketWithSpend> = {}): BucketWithSpend {
  return {
    id: 'b1',
    plan_id: 'p1',
    slug: 'needs',
    name: 'Necesidades',
    pct: 50,
    color: '#2A4BFF',
    soft_color: '#E2E7FF',
    sort_order: 0,
    items: [
      { id: 'i1', bucket_id: 'b1', slug: 'rent', name: 'Renta', pct: 25, category_id: null, icon: 'rent', sort_order: 0, spent: 7000 },
      { id: 'i2', bucket_id: 'b1', slug: 'food', name: 'Despensa', pct: 13, category_id: null, icon: 'food', sort_order: 1, spent: 3200 },
    ],
    ...overrides,
  }
}

describe('bucketStats', () => {
  it('computes plan vs real for an under-budget bucket', () => {
    const monthly = 28000
    const b = makeBucket({ pct: 50 })
    const s = bucketStats(b, monthly)
    expect(s.planAmount).toBe(14000)        // 28000 * 50%
    expect(s.spent).toBe(10200)             // 7000 + 3200
    expect(s.diff).toBe(-3800)
    expect(s.ratio).toBeCloseTo(10200 / 14000, 5)
    expect(s.itemsPlanPct).toBe(38)
  })

  it('marks diff positive when over budget and clamps ratio at 1.5', () => {
    const monthly = 10000
    const b = makeBucket({
      pct: 50,
      items: [
        { id: 'i1', bucket_id: 'b1', slug: 'x', name: 'X', pct: 50, category_id: null, icon: null, sort_order: 0, spent: 100000 },
      ],
    })
    const s = bucketStats(b, monthly)
    expect(s.planAmount).toBe(5000)
    expect(s.diff).toBe(95000)
    expect(s.ratio).toBe(1.5)
  })

  it('returns zero ratio when planAmount is zero (no income)', () => {
    const b = makeBucket({ pct: 50 })
    expect(bucketStats(b, 0).ratio).toBe(0)
  })

  it('treats missing spent as zero', () => {
    const b = makeBucket({
      items: [
        // @ts-expect-error — intentionally omitting spent to mimic legacy data.
        { id: 'i1', bucket_id: 'b1', slug: 'x', name: 'X', pct: 50, category_id: null, icon: null, sort_order: 0 },
      ],
    })
    expect(bucketStats(b, 10000).spent).toBe(0)
  })
})

describe('applyPreset', () => {
  it('scales bucket pct to preset values and proportionally scales items', () => {
    const seed = DEFAULT_BUCKETS_SEED.map((b) => ({
      id: 'b' + b.slug,
      plan_id: 'p1',
      slug: b.slug,
      name: b.name,
      pct: b.pct,
      color: b.color,
      soft_color: b.soft_color,
      sort_order: b.sort_order,
      items: b.items.map((it, i) => ({
        id: `i${b.slug}-${i}`,
        bucket_id: 'b' + b.slug,
        slug: it.slug,
        name: it.name,
        pct: it.pct,
        category_id: null,
        icon: it.icon,
        sort_order: it.sort_order,
      })),
    }))

    const next = applyPreset(seed, '70-20-10')
    expect(next.map((b) => b.pct)).toEqual([70, 20, 10])

    // Needs went 50→70 → items scale ×1.4. Renta 25 → 35.
    const rent = next[0].items.find((it) => it.slug === 'rent')!
    expect(rent.pct).toBe(Math.round(25 * 1.4))
  })

  it('handles the agresivo preset (40/20/40)', () => {
    const seed = DEFAULT_BUCKETS_SEED.map((b) => ({
      id: 'b' + b.slug,
      plan_id: 'p1',
      slug: b.slug,
      name: b.name,
      pct: b.pct,
      color: b.color,
      soft_color: b.soft_color,
      sort_order: b.sort_order,
      items: b.items.map((it, i) => ({
        id: `i${b.slug}-${i}`,
        bucket_id: 'b' + b.slug,
        slug: it.slug,
        name: it.name,
        pct: it.pct,
        category_id: null,
        icon: it.icon,
        sort_order: it.sort_order,
      })),
    }))
    const next = applyPreset(seed, 'agresivo')
    expect(next.map((b) => b.pct)).toEqual([40, 20, 40])
  })
})

describe('planIntegrityPct', () => {
  it('sums to 100 for the default seed', () => {
    const seed = DEFAULT_BUCKETS_SEED.map((b) => ({
      ...b,
      id: 'b' + b.slug,
      plan_id: 'p',
      items: b.items.map((it, i) => ({
        ...it,
        id: `i${i}`,
        bucket_id: 'b' + b.slug,
        category_id: null,
      })),
    }))
    expect(planIntegrityPct(seed)).toBe(100)
  })
})
