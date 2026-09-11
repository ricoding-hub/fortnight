import { describe, expect, it } from 'vitest'
import { debtFreeMonth, expectedToday, monthsBetween, monthsToGoal, projectGoal, resolveDebtGoal } from './goals'
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

/* ── Mes libre de deuda ───────────────────────────────────────────────────── */

/** La meta que la app siembra sola: monthly = deuda x 1.05 / 6. */
const sembrada = (creditDebt: number): Goal =>
  goal({
    is_debt: true,
    name: 'Liberar tarjetas',
    target: creditDebt,
    saved: 0,
    monthly: Math.round((creditDebt * 1.05) / 6),
    linked_account_ids: [],
  })

const HOY = new Date(2026, 8, 11) // 11 sep 2026, la fecha del reporte

describe('resolveDebtGoal — el caso del reporte', () => {
  it('la fórmula sembrada da 6 meses para cualquiera, que es el defecto', () => {
    // ceil(deuda / (deuda * 1.05 / 6)) = ceil(6/1.05) = 6, y la deuda se cancela.
    expect(monthsToGoal(sembrada(60012))).toBe(6)
    expect(monthsToGoal(sembrada(9000))).toBe(6)
    expect(monthsToGoal(sembrada(500000))).toBe(6)
  })

  it('con la derivación, dos deudas distintas dan meses distintos', () => {
    const plan = { disposable: 8317 }
    const a = resolveDebtGoal(sembrada(60012), { creditDebt: 60012, ...plan })
    const b = resolveDebtGoal(sembrada(9000), { creditDebt: 9000, ...plan })
    expect(monthsToGoal(a!)).not.toBe(monthsToGoal(b!))
    expect(monthsToGoal(a!)).toBe(Math.ceil(60012 / 8317)) // 8
    expect(monthsToGoal(b!)).toBe(Math.ceil(9000 / 8317))  // 2
  })

  it('usa la deuda viva, no la del día que se sembró la meta', () => {
    // La meta se sembró con 60,012 y desde entonces bajó a 58,219. El objetivo
    // guardado se queda quieto; lo que manda es lo que se debe hoy.
    const g = resolveDebtGoal(sembrada(60012), { creditDebt: 58219, disposable: 8317 })!
    expect(g.saved).toBe(60012 - 58219)
    expect(monthsToGoal(g)).toBe(7)   // ceil(58219 / 8317)
    const m = debtFreeMonth(g, HOY)!
    expect(m.getMonth()).toBe(3)      // abr 2027, lo que ya mostraba Proyección
    expect(m.getFullYear()).toBe(2027)
  })

  it('no inventa una fecha cuando no hay aporte real', () => {
    expect(resolveDebtGoal(sembrada(60012), { creditDebt: 60012, disposable: 0 })).toBeNull()
    expect(resolveDebtGoal(sembrada(60012), { creditDebt: 60012, disposable: -500 })).toBeNull()
    expect(debtFreeMonth(null, HOY)).toBeNull()
  })

  it('respeta al usuario que ligó cuentas y eligió su aporte', () => {
    const propia = goal({ is_debt: true, target: 30000, saved: 10000, monthly: 4000, linked_account_ids: ['a1'] })
    const r = resolveDebtGoal(propia, { creditDebt: 99999, disposable: 8317 })
    expect(r).toEqual(propia)          // ni saved ni monthly se pisan
    expect(monthsToGoal(r!)).toBe(5)
  })

  it('descarta una meta sin aporte alguno en vez de dividir entre cero', () => {
    const sinAporte = goal({ is_debt: true, monthly: 0, linked_account_ids: ['a1'] })
    expect(resolveDebtGoal(sinAporte, { creditDebt: 1000, disposable: 500 })).toBeNull()
  })
})

describe('debtFreeMonth', () => {
  it('nombra el mes aunque la serie de la gráfica se corte en 8 puntos', () => {
    // 24 meses de pago: projectGoal sólo devuelve 8 puntos y ninguno llega a 0.
    const largo = goal({ is_debt: true, target: 240000, saved: 0, monthly: 10000, linked_account_ids: [] })
    expect(projectGoal(largo, HOY)).toHaveLength(8)
    expect(projectGoal(largo, HOY).some((p) => p.value === 0)).toBe(false)
    const m = debtFreeMonth(largo, HOY)!
    expect(m.getMonth()).toBe(8)       // sep
    expect(m.getFullYear()).toBe(2028) // 24 meses después
  })

  it('cruza el fin de año sin perderse', () => {
    const g = goal({ is_debt: true, target: 8000, saved: 0, monthly: 2000, linked_account_ids: [] })
    const m = debtFreeMonth(g, new Date(2026, 10, 15))! // nov 2026 + 4
    expect(m.getMonth()).toBe(2)
    expect(m.getFullYear()).toBe(2027)
  })

  it('no se corre de mes por el día 31', () => {
    // Con setMonth sobre un día 31, "31 ene + 1 mes" salta a marzo.
    const g = goal({ is_debt: true, target: 1000, saved: 0, monthly: 1000, linked_account_ids: [] })
    const m = debtFreeMonth(g, new Date(2026, 0, 31))!
    expect(m.getMonth()).toBe(1)       // febrero, no marzo
  })
})
