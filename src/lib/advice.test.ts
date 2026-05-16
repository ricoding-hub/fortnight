import { describe, expect, it } from 'vitest'
import { richetoAdvice } from './advice'
import type { BucketWithSpend } from './plan'
import type { Goal } from '@/types'

function bucket(overrides: Partial<BucketWithSpend>): BucketWithSpend {
  return {
    id: 'b',
    plan_id: 'p',
    slug: 'needs',
    name: 'Necesidades',
    pct: 50,
    color: '#2A4BFF',
    soft_color: '#E2E7FF',
    sort_order: 0,
    items: [],
    ...overrides,
  }
}

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: 'g1',
    user_id: 'u',
    name: 'Viaje',
    icon: 'rocket',
    color: '#9B7BFF',
    target: 50000,
    saved: 10000,
    monthly: 2000,
    deadline: null,
    is_debt: false,
    started_at: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('richetoAdvice', () => {
  it('flags overspent buckets with the worst item as the culprit', () => {
    const monthly = 28000
    const b = bucket({
      pct: 50,
      items: [
        { id: 'i1', bucket_id: 'b', slug: 'rent', name: 'Renta', pct: 25, category_id: null, icon: 'rent', sort_order: 0, spent: 8000 },
        { id: 'i2', bucket_id: 'b', slug: 'food', name: 'Despensa', pct: 13, category_id: null, icon: 'food', sort_order: 1, spent: 10000 },
      ],
    })
    const tips = richetoAdvice([b], monthly, [])
    expect(tips).toHaveLength(1)
    expect(tips[0].kind).toBe('over')
    // 18000 spent on a 14000 plan → $4000 over
    expect(tips[0].title).toContain('$4,000')
    // Worst item is Despensa (plan 3640, spent 10000 → +6360)
    expect(tips[0].body).toContain('Despensa')
  })

  it('does not flag a bucket that is on or under budget', () => {
    const b = bucket({ pct: 50, items: [] })
    expect(richetoAdvice([b], 28000, [])).toHaveLength(0)
  })

  it('coaches a goal that is more than $500 behind plan', () => {
    // Started Jan 1 2026, monthly 2000 — by month 4 expected is 8000. Saved 5000 → 3000 behind.
    const g = goal({ started_at: '2026-01-01', monthly: 2000, saved: 5000 })
    const tips = richetoAdvice([], 0, [g])
    const behind = tips.find((t) => t.kind === 'goal-behind')
    expect(behind).toBeTruthy()
    expect(behind!.title).toContain('Viaje')
  })

  it('praises a goal that is more than $500 ahead', () => {
    const g = goal({ started_at: '2026-01-01', monthly: 1000, saved: 50000, target: 100000 })
    const tips = richetoAdvice([], 0, [g])
    const ahead = tips.find((t) => t.kind === 'goal-ahead')
    expect(ahead).toBeTruthy()
  })

  it('ignores debt goals for plan-vs-real coaching', () => {
    const g = goal({ is_debt: true, saved: 0 })
    expect(richetoAdvice([], 0, [g])).toHaveLength(0)
  })

  it('warns when the savings bucket is under-funded', () => {
    const save = bucket({
      slug: 'save',
      name: 'Ahorro',
      pct: 20,
      items: [
        { id: 'i', bucket_id: 'b', slug: 'goal', name: 'Meta', pct: 20, category_id: null, icon: 'target', sort_order: 0, spent: 100 },
      ],
    })
    const tips = richetoAdvice([save], 10000, []) // plan = 2000, spent = 100 → < 60%
    expect(tips.find((t) => t.kind === 'save-low')).toBeTruthy()
  })

  it('caps output at 4 tips', () => {
    const buckets = ['needs', 'wants', 'save', 'foo', 'bar'].map((slug) =>
      bucket({
        id: slug,
        slug,
        pct: 50,
        items: [
          { id: slug + '-1', bucket_id: slug, slug: 'x', name: 'X', pct: 50, category_id: null, icon: null, sort_order: 0, spent: 99999 },
        ],
      }),
    )
    expect(richetoAdvice(buckets, 1000, [])).toHaveLength(4)
  })
})
