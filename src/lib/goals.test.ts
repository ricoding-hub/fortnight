import { describe, expect, it } from 'vitest'
import { expectedToday, monthsBetween, monthsToGoal, projectGoal } from './goals'
import type { Goal } from '@/types'

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    name: 'Viaje a Japón',
    icon: 'rocket',
    color: '#9B7BFF',
    target: 50000,
    saved: 12500,
    monthly: 2800,
    deadline: '2026-12-31',
    is_debt: false,
    is_primary: false,
    started_at: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    linked_account_ids: [],
    ...overrides,
  }
}

describe('monthsBetween', () => {
  it('returns whole months elapsed between two dates', () => {
    expect(monthsBetween('2026-01-15', new Date(2026, 4, 15, 12))).toBe(4)
    expect(monthsBetween('2026-01-15', new Date(2026, 4, 10, 12))).toBe(3) // not yet past day-of-month
    expect(monthsBetween('2026-01-15', new Date(2026, 0, 15, 12))).toBe(0)
  })

  it('never returns negative', () => {
    expect(monthsBetween('2026-12-01', new Date(2026, 0, 1, 12))).toBe(0)
  })
})

describe('expectedToday', () => {
  it('= elapsed months × monthly contribution', () => {
    const g = goal({ started_at: '2026-01-01', monthly: 2000 })
    expect(expectedToday(g, new Date(2026, 4, 1, 12))).toBe(8000) // 4 months × 2000
  })

  it('clamps at target', () => {
    const g = goal({ started_at: '2026-01-01', monthly: 100000, target: 50000 })
    expect(expectedToday(g, new Date(2026, 4, 1, 12))).toBe(50000)
  })
})

describe('projectGoal — savings', () => {
  it('grows from saved toward target capped at target', () => {
    const g = goal({ saved: 10000, target: 30000, monthly: 5000, is_debt: false })
    const points = projectGoal(g, new Date(2026, 4, 1, 12)) // May
    expect(points[0].value).toBe(10000)
    expect(points[1].value).toBe(15000)
    expect(points[points.length - 1].value).toBeLessThanOrEqual(30000)
  })
})

describe('projectGoal — debt', () => {
  it('shrinks from target toward 0', () => {
    const g = goal({ saved: 0, target: 20000, monthly: 5000, is_debt: true })
    const points = projectGoal(g, new Date(2026, 4, 1, 12))
    expect(points[0].value).toBe(20000)
    expect(points[points.length - 1].value).toBe(0)
  })
})

describe('monthsToGoal', () => {
  it('rounds up division of remaining by monthly', () => {
    expect(monthsToGoal(goal({ saved: 10000, target: 30000, monthly: 5000 }))).toBe(4)
  })

  it('returns Infinity when monthly is 0', () => {
    expect(monthsToGoal(goal({ monthly: 0 }))).toBe(Infinity)
  })
})
