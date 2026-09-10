import { describe, it, expect } from 'vitest'
import { EVENT_STYLE, KIND_ORDER, PRIMARY_CELL, dominantPrimary, isPrimary, tierOf } from './eventStyle'
import type { CalendarEventKind } from '@/lib/calendar'

describe('dominantPrimary', () => {
  it('gives the day to the payday when money also leaves it', () => {
    expect(dominantPrimary(['card_due', 'payday'])).toBe('payday')
    expect(dominantPrimary(['card_cut', 'card_due', 'payday'])).toBe('payday')
  })

  it('prefers the deadline you can miss over the cut you cannot', () => {
    expect(dominantPrimary(['card_cut', 'card_due'])).toBe('card_due')
  })

  it('ignores everything that is only context', () => {
    expect(dominantPrimary(['transaction', 'subscription', 'installment', 'goal'])).toBeNull()
    expect(dominantPrimary(['transaction', 'card_cut'])).toBe('card_cut')
  })

  it('is empty for an empty day', () => {
    expect(dominantPrimary([])).toBeNull()
  })

  it('only returns kinds that have a cell treatment', () => {
    const got = dominantPrimary(['card_due'])
    expect(got && PRIMARY_CELL[got]).toBeTruthy()
  })
})

describe('tierOf', () => {
  it('ranks the dates the month is planned around first', () => {
    expect(tierOf('payday')).toBe('primary')
    expect(tierOf('card_due')).toBe('primary')
    expect(tierOf('card_cut')).toBe('primary')
  })

  it('keeps recurring charges as legible context', () => {
    expect(tierOf('subscription')).toBe('secondary')
    expect(tierOf('installment')).toBe('secondary')
    expect(tierOf('goal')).toBe('secondary')
  })

  it('puts what the user typed in at the bottom', () => {
    expect(tierOf('transaction')).toBe('movement')
  })

  it('agrees with isPrimary', () => {
    for (const k of KIND_ORDER) expect(isPrimary(k)).toBe(tierOf(k) === 'primary')
  })
})

describe('KIND_ORDER', () => {
  it('covers every kind exactly once, so no marker can go unclaimed', () => {
    const kinds = Object.keys(EVENT_STYLE) as CalendarEventKind[]
    expect([...KIND_ORDER].sort()).toEqual([...kinds].sort())
  })

  it('lists all primaries before anything else — the marker budget depends on it', () => {
    const lastPrimary = Math.max(...KIND_ORDER.map((k, i) => (isPrimary(k) ? i : -1)))
    const firstOther = KIND_ORDER.findIndex((k) => !isPrimary(k))
    expect(lastPrimary).toBeLessThan(firstOther)
  })

  it('leaves manual movements last', () => {
    expect(KIND_ORDER[KIND_ORDER.length - 1]).toBe('transaction')
  })
})
