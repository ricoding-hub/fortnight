import { describe, expect, it } from 'vitest'
import { getExigibleEsteCiclo, getMsiUncovered, getRevolvingBalance } from '@/lib/debt'
import type { Account, Installment } from '@/types'

function card(over: Partial<Account> = {}): Account {
  return {
    id: 'c', user_id: 'u', name: 'Tarjeta', type: 'credit', balance: 4000,
    credit_limit: 50000, cut_day: null, payment_due_day: null, payment_grace_days: null,
    color: null, logo_domain: null, sort_order: null, created_at: '', updated_at: '',
    source: 'manual', syncfy_credential_id: null, external_id: null,
    institution_name: null, last_synced_at: null, cost_type: 'con_costo', apr: null,
    min_payment_pct: null, prepay_buffer: 0, ...over,
  } as Account
}

function msi(over: Partial<Installment> = {}): Installment {
  return {
    id: 'i', user_id: 'u', account_id: 'c', name: 'MSI', total_amount: 12000,
    monthly_amount: 1000, months_total: 12, months_paid: 0, start_date: '2026-01-01',
    status: 'active', is_zero_interest: true, created_at: '', updated_at: '', ...over,
  } as Installment
}

describe('getExigibleEsteCiclo — mínimo cuando la tarjeta no define porcentaje', () => {
  // Number(null) === 0 passes isFinite, so the documented 1.5% default was
  // never reached: a plain revolving card reported nothing due, and that fed
  // "A pagar este mes" on Home.
  it('cae al 1.5% cuando min_payment_pct es null', () => {
    expect(getExigibleEsteCiclo(card(), [])).toBeCloseTo(60, 5)
  })

  it('respeta un porcentaje explícito', () => {
    expect(getExigibleEsteCiclo(card({ min_payment_pct: 5 }), [])).toBeCloseTo(200, 5)
  })

  // An explicit 0 is a real choice and must not be replaced by the default.
  it('respeta un cero explícito', () => {
    expect(getExigibleEsteCiclo(card({ min_payment_pct: 0 }), [])).toBe(0)
  })

  it('deja en cero el mínimo de una tarjeta sin costo', () => {
    expect(getExigibleEsteCiclo(card({ cost_type: 'sin_costo' }), [])).toBe(0)
  })

  it('suma la mensualidad del MSI al mínimo revolvente', () => {
    // saldo 4000 con 12000 de MSI pendiente -> revolvente 0, exigible = MSI
    expect(getExigibleEsteCiclo(card(), [msi()])).toBeCloseTo(1000, 5)
  })

  it('descuenta el colchón adelantado, sin bajar de cero', () => {
    expect(getExigibleEsteCiclo(card({ prepay_buffer: 400 }), [msi()])).toBeCloseTo(600, 5)
    expect(getExigibleEsteCiclo(card({ prepay_buffer: 99999 }), [msi()])).toBe(0)
  })

  it('ignora cuentas de débito', () => {
    expect(getExigibleEsteCiclo(card({ type: 'debit' }), [])).toBe(0)
  })
})

describe('getRevolvingBalance', () => {
  it('resta el principal de MSI del saldo', () => {
    expect(getRevolvingBalance(card({ balance: 15000 }), [msi()])).toBe(3000)
  })

  it('nunca devuelve negativo', () => {
    expect(getRevolvingBalance(card({ balance: 1000 }), [msi()])).toBe(0)
  })

  it('ignora MSI de otra tarjeta', () => {
    expect(getRevolvingBalance(card({ balance: 5000 }), [msi({ account_id: 'otra' })])).toBe(5000)
  })
})

describe('getMsiUncovered', () => {
  // El caso de Juan: NU CREDITO en $0.00 con $2,976.19 a 7 meses vivos.
  // getRevolvingBalance lo aplastaba a 0 y la contradicción no se veía.
  it('expone el hueco que el clamp escondía', () => {
    const plan = msi({ monthly_amount: 425.17, months_total: 18, months_paid: 11 })
    expect(getRevolvingBalance(card({ balance: 0 }), [plan])).toBe(0)
    expect(getMsiUncovered(card({ balance: 0 }), [plan])).toBeCloseTo(2976.19, 2)
  })

  it('es cero cuando el saldo sí cubre el plan', () => {
    expect(getMsiUncovered(card({ balance: 15000 }), [msi()])).toBe(0)
  })

  it('es cero justo en el límite', () => {
    expect(getMsiUncovered(card({ balance: 12000 }), [msi()])).toBe(0)
  })

  it('ignora planes de otra tarjeta', () => {
    expect(getMsiUncovered(card({ balance: 0 }), [msi({ account_id: 'otra' })])).toBe(0)
  })

  it('ignora planes ya saldados', () => {
    expect(getMsiUncovered(card({ balance: 0 }), [msi({ status: 'paid' })])).toBe(0)
  })

  it('suma varios planes de la misma tarjeta', () => {
    const dos = [msi({ id: 'a' }), msi({ id: 'b', monthly_amount: 500, months_total: 6 })]
    expect(getMsiUncovered(card({ balance: 5000 }), dos)).toBe(10000)
  })

  it('no aplica a débito', () => {
    expect(getMsiUncovered(card({ type: 'debit', balance: 0 }), [msi()])).toBe(0)
  })

  // Complemento exacto: o el saldo sobra (revolving) o falta (uncovered),
  // nunca las dos cosas.
  it('es el complemento de getRevolvingBalance', () => {
    for (const balance of [0, 5000, 12000, 20000]) {
      const c = card({ balance })
      const rev = getRevolvingBalance(c, [msi()])
      const gap = getMsiUncovered(c, [msi()])
      expect(rev - gap).toBeCloseTo(balance - 12000, 5)
      expect(Math.min(rev, gap)).toBe(0)
    }
  })
})
