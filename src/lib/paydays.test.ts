import { describe, expect, it } from 'vitest'
import { computePaydays, fmtPayday, isPayday } from './paydays'

/** Build a local-time noon date — matches the lib's internal normalisation. */
function d(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12, 0, 0, 0)
}

describe('computePaydays — catorcenal stepping', () => {
  it('steps every 14 days from the reference once today is reached', () => {
    // Reference = 2026-05-01 (Friday). Today = 2026-05-15 — exactly one step.
    const out = computePaydays(d(2026, 4, 1), 'catorcenal', 4, d(2026, 4, 15))
    expect(out.map((x) => [x.getMonth(), x.getDate()])).toEqual([
      [4, 15],
      [4, 29],
      [5, 12],
      [5, 26],
    ])
  })

  it('walks forward past several missed cycles when today is far from reference', () => {
    // Reference = 2026-01-02; today = 2026-05-20. Should land on the next on-or-after.
    const out = computePaydays(d(2026, 0, 2), 'catorcenal', 1, d(2026, 4, 20))
    const next = out[0]
    expect(next.getTime()).toBeGreaterThanOrEqual(d(2026, 4, 20).getTime())
    // The next payday after May 20 starting from Jan 2 + 14n: Jan 16, Jan 30, …, May 8, May 22.
    expect([next.getMonth(), next.getDate()]).toEqual([4, 22])
  })
})

describe('computePaydays — quincenal', () => {
  it('ref day 1 yields [1, 16] within each month', () => {
    const out = computePaydays(d(2026, 4, 1), 'quincenal', 4, d(2026, 4, 1))
    expect(out.map((x) => x.getDate())).toEqual([1, 16, 1, 16])
    expect(out.map((x) => x.getMonth())).toEqual([4, 4, 5, 5])
  })

  it('ref day 20 yields [5, 20] within each month', () => {
    // Today is May 1 so all of May 5 and May 20 are >= today and should appear.
    const out = computePaydays(d(2026, 4, 20), 'quincenal', 4, d(2026, 4, 1))
    expect(out.map((x) => x.getDate())).toEqual([5, 20, 5, 20])
    expect(out.map((x) => x.getMonth())).toEqual([4, 4, 5, 5])
  })

  it('skips dates already in the past within the current month', () => {
    // Ref day 1 → [1, 16]. Today is May 10 → May 1 is past, first hit is May 16.
    const out = computePaydays(d(2026, 4, 1), 'quincenal', 3, d(2026, 4, 10))
    expect(out.map((x) => [x.getMonth(), x.getDate()])).toEqual([
      [4, 16],
      [5, 1],
      [5, 16],
    ])
  })
})

describe('computePaydays — mensual', () => {
  it('returns a single date stepping by ~30 days', () => {
    const out = computePaydays(d(2026, 4, 1), 'mensual', 3, d(2026, 4, 15))
    // Next on-or-after May 15 from May 1 + 30n → May 31, then +30 → Jun 30, Jul 30.
    expect(out.map((x) => [x.getMonth(), x.getDate()])).toEqual([
      [4, 31],
      [5, 30],
      [6, 30],
    ])
  })
})

describe('computePaydays — today-as-payday edge case', () => {
  it('includes today when it is exactly a payday (catorcenal)', () => {
    const ref = d(2026, 4, 1)
    const today = d(2026, 4, 15) // exactly +14 days
    const out = computePaydays(ref, 'catorcenal', 1, today)
    expect(out[0].getDate()).toBe(15)
    expect(out[0].getMonth()).toBe(4)
    expect(isPayday(ref, 'catorcenal', today)).toBe(true)
  })

  it('includes today when it is exactly a quincenal payday', () => {
    const ref = d(2026, 4, 1) // → [1, 16]
    const today = d(2026, 4, 16)
    const out = computePaydays(ref, 'quincenal', 1, today)
    expect(out[0].getDate()).toBe(16)
    expect(isPayday(ref, 'quincenal', today)).toBe(true)
  })

  it('returns false on a non-payday', () => {
    const ref = d(2026, 4, 1)
    expect(isPayday(ref, 'catorcenal', d(2026, 4, 16))).toBe(false)
  })
})

describe('fmtPayday', () => {
  it('formats day + Spanish short month, lowercase', () => {
    expect(fmtPayday(d(2026, 4, 15))).toBe('15 may')
    expect(fmtPayday(d(2026, 0, 1))).toBe('1 ene')
    expect(fmtPayday(d(2026, 11, 31))).toBe('31 dic')
  })
})

describe('computePaydays — invalid reference', () => {
  it('returns [] when reference is an invalid Date', () => {
    expect(computePaydays(new Date('not-a-date'), 'catorcenal')).toEqual([])
  })
})
