import { describe, expect, it } from 'vitest'
import { calculateScore, weeklyScoreDelta } from '@/lib/score'
import type { Account, ScoreSnapshot } from '@/types'

function debit(balance: number): Account {
  return {
    id: 'd',
    user_id: 'u',
    name: 'Debit',
    type: 'debit',
    balance,
    credit_limit: null,
    cut_day: null,
    payment_due_day: null,
    payment_grace_days: null,
    color: null,
    logo_domain: null,
    sort_order: null,
    created_at: '',
    updated_at: '',
    source: 'manual',
    syncfy_credential_id: null,
    external_id: null,
    institution_name: null,
    last_synced_at: null,
    cost_type: 'con_costo',
    apr: null,
    min_payment_pct: null,
    prepay_buffer: 0,
  }
}

function credit(balance: number, limit: number | null = null): Account {
  return {
    ...debit(balance),
    id: 'c',
    type: 'credit',
    credit_limit: limit,
  }
}

describe('score: posición + avance', () => {
  it('sin cuentas ni datos no truena y da un número válido', () => {
    const { score } = calculateScore({ accounts: [] })
    expect(score).toBeGreaterThanOrEqual(1)
    expect(score).toBeLessThanOrEqual(10)
  })

  it('el caso de Richy: mucha deuda y sin colchón queda bajo (2.5–3.5)', () => {
    const { score, breakdown } = calculateScore({
      accounts: [debit(860), credit(61781, 100000)],
      ingresoMensual: 30000,
      gastosFijosMensuales: 12000,
    })
    expect(score).toBeGreaterThanOrEqual(2.5)
    expect(score).toBeLessThanOrEqual(3.5)
    expect(breakdown.avance).toBe(0)
  })

  it('sin deuda y con tres meses de colchón, cerca de 8', () => {
    const { score } = calculateScore({ accounts: [debit(36000), credit(0, 50000)], ingresoMensual: 30000, gastosFijosMensuales: 12000 })
    expect(score).toBeGreaterThanOrEqual(7.9)
  })

  it('pagar 10 % de la deuda en 30 días lo sube al menos 0.8', () => {
    const base = { accounts: [debit(860), credit(61781, 100000)], ingresoMensual: 30000, gastosFijosMensuales: 12000 }
    const quieto = calculateScore(base).score
    const pagando = calculateScore({ ...base, desde: '2026-10-01', movimientos: [{ account_id: 'c', amount: -6178, date: '2026-10-15' }] })
    expect(pagando.score - quieto).toBeGreaterThanOrEqual(0.8)
  })

  it('endeudarse 10 % en 30 días lo baja', () => {
    const base = { accounts: [debit(860), credit(61781, 100000)], ingresoMensual: 30000, gastosFijosMensuales: 12000 }
    const quieto = calculateScore(base).score
    const gastando = calculateScore({ ...base, desde: '2026-10-01', movimientos: [{ account_id: 'c', amount: 6178, date: '2026-10-15' }] })
    expect(gastando.score).toBeLessThan(quieto)
  })

  it('registrar un ingreso ya no lo baja', () => {
    const base = { accounts: [debit(15860), credit(61781, 100000)], ingresoMensual: 30000, gastosFijosMensuales: 12000 }
    const conIngreso = calculateScore({ ...base, desde: '2026-10-01', movimientos: [{ account_id: 'd', amount: 15000, date: '2026-10-15' }] })
    const sinIngreso = calculateScore({ ...base, accounts: [debit(15860), credit(61781, 100000)] })
    expect(conIngreso.score).toBeGreaterThanOrEqual(sinIngreso.score)
  })

  it('pagar de más una tarjeta que ya estaba en cero no cuenta como deuda bajada', () => {
    const otra = { ...credit(-500, 20000), id: 'c2' }
    const base = { accounts: [debit(5000), credit(10000, 50000), otra], ingresoMensual: 30000, gastosFijosMensuales: 12000 }
    // La segunda tarjeta pasó de 0 a −500 (saldo a favor).
    const r = calculateScore({ ...base, desde: '2026-10-01', movimientos: [{ account_id: 'c2', amount: -500, date: '2026-10-15' }] })
    expect(r.breakdown.deudaHace30).toBe(r.breakdown.deudaHoy)
    expect(r.breakdown.avance).toBe(0)
  })

  it('una tarjeta sin límite no cuenta como «al tope»', () => {
    const { breakdown } = calculateScore({ accounts: [debit(1000), credit(5000, null)], ingresoMensual: 20000 })
    expect(breakdown.utilizacion).toBeNull()
  })

  it('redondea a un decimal', () => {
    const { score } = calculateScore({ accounts: [debit(1234), credit(5678, 20000)], ingresoMensual: 17000 })
    expect(Math.round(score * 10) / 10).toBe(score)
  })
})

describe('weeklyScoreDelta', () => {
  // El hook los entrega del más reciente al más antiguo.
  const snap = (day: string, score: number) => ({ day, score } as ScoreSnapshot)
  const MONDAY = '2026-09-07'

  it('measures against where the week opened, not against the sparkline', () => {
    const history = [
      snap('2026-09-09', 4.2),
      snap('2026-09-07', 4.0),
      snap('2026-09-06', 3.5), // domingo: cierre de la semana pasada
      snap('2026-08-20', 8.0), // dentro del sparkline de 30 días, fuera de la semana
    ]
    // 4.5 hoy contra 3.5 al cerrar el domingo — el 8.0 de agosto no participa.
    expect(weeklyScoreDelta(history, 4.5, MONDAY)).toBe(1)
  })

  it('falls back to the oldest reading inside the week for a new user', () => {
    const history = [snap('2026-09-09', 4.2), snap('2026-09-08', 3.0)]
    expect(weeklyScoreDelta(history, 3.6, MONDAY)).toBe(0.6)
  })

  it('returns null when there is nothing to compare against', () => {
    expect(weeklyScoreDelta([], 5, MONDAY)).toBeNull()
  })

  it('reports a drop as negative', () => {
    expect(weeklyScoreDelta([snap('2026-09-06', 6)], 4.5, MONDAY)).toBe(-1.5)
  })

  it('rounds to one decimal, like the label shows it', () => {
    expect(weeklyScoreDelta([snap('2026-09-06', 3.33)], 4.0, MONDAY)).toBe(0.7)
  })

  it('handles the numeric strings Postgres returns for numeric columns', () => {
    const history = [{ day: '2026-09-06', score: '3.5' } as unknown as ScoreSnapshot]
    expect(weeklyScoreDelta(history, 4.5, MONDAY)).toBe(1)
  })
})
