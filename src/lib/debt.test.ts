import { describe, expect, it } from 'vitest'
import { getDeudaALaVista, getExigibleEsteCiclo, getMsiUncovered, getRevolvingBalance } from '@/lib/debt'

/** El día de la compra de los planes de prueba: nada ha vencido aún. */
const HOY = '2026-01-01'
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
    expect(getExigibleEsteCiclo(card(), [], HOY)).toBeCloseTo(60, 5)
  })

  it('respeta un porcentaje explícito', () => {
    expect(getExigibleEsteCiclo(card({ min_payment_pct: 5 }), [], HOY)).toBeCloseTo(200, 5)
  })

  // An explicit 0 is a real choice and must not be replaced by the default.
  it('respeta un cero explícito', () => {
    expect(getExigibleEsteCiclo(card({ min_payment_pct: 0 }), [], HOY)).toBe(0)
  })

  it('deja en cero el mínimo de una tarjeta sin costo', () => {
    expect(getExigibleEsteCiclo(card({ cost_type: 'sin_costo' }), [], HOY)).toBe(0)
  })

  it('suma la mensualidad del MSI al mínimo revolvente', () => {
    // saldo 4000 con 12000 de MSI pendiente -> revolvente 0, exigible = MSI
    expect(getExigibleEsteCiclo(card(), [msi()], HOY)).toBeCloseTo(1000, 5)
  })

  it('descuenta el colchón adelantado, sin bajar de cero', () => {
    expect(getExigibleEsteCiclo(card({ prepay_buffer: 400 }), [msi()], HOY)).toBeCloseTo(600, 5)
    expect(getExigibleEsteCiclo(card({ prepay_buffer: 99999 }), [msi()], HOY)).toBe(0)
  })

  it('ignora cuentas de débito', () => {
    expect(getExigibleEsteCiclo(card({ type: 'debit' }), [], HOY)).toBe(0)
  })
})

describe('getRevolvingBalance', () => {
  it('resta el principal de MSI del saldo', () => {
    expect(getRevolvingBalance(card({ balance: 15000 }), [msi()], HOY)).toBe(3000)
  })

  it('nunca devuelve negativo', () => {
    expect(getRevolvingBalance(card({ balance: 1000 }), [msi()], HOY)).toBe(0)
  })

  it('ignora MSI de otra tarjeta', () => {
    expect(getRevolvingBalance(card({ balance: 5000 }), [msi({ account_id: 'otra' })], HOY)).toBe(5000)
  })
})

describe('getMsiUncovered', () => {
  // El caso de Juan: NU CREDITO en $0.00 con $2,976.19 a 7 meses vivos.
  // getRevolvingBalance lo aplastaba a 0 y la contradicción no se veía.
  it('expone el hueco que el clamp escondía', () => {
    const plan = msi({ total_amount: 7653.06, monthly_amount: 425.17, months_total: 18, months_paid: 11 })
    expect(getRevolvingBalance(card({ balance: 0 }), [plan], HOY)).toBe(0)
    expect(getMsiUncovered(card({ balance: 0 }), [plan], HOY)).toBeCloseTo(2976.19, 2)
  })

  it('es cero cuando el saldo sí cubre el plan', () => {
    expect(getMsiUncovered(card({ balance: 15000 }), [msi()], HOY)).toBe(0)
  })

  it('es cero justo en el límite', () => {
    expect(getMsiUncovered(card({ balance: 12000 }), [msi()], HOY)).toBe(0)
  })

  it('ignora planes de otra tarjeta', () => {
    expect(getMsiUncovered(card({ balance: 0 }), [msi({ account_id: 'otra' })], HOY)).toBe(0)
  })

  it('ignora planes ya saldados', () => {
    expect(getMsiUncovered(card({ balance: 0 }), [msi({ status: 'paid' })], HOY)).toBe(0)
  })

  it('suma varios planes de la misma tarjeta', () => {
    const dos = [msi({ id: 'a' }), msi({ id: 'b', total_amount: 3000, monthly_amount: 500, months_total: 6 })]
    expect(getMsiUncovered(card({ balance: 5000 }), dos, '2025-12-31')).toBe(10000)
  })

  it('no aplica a débito', () => {
    expect(getMsiUncovered(card({ type: 'debit', balance: 0 }), [msi()], HOY)).toBe(0)
  })

  // Antes era el complemento exacto de getRevolvingBalance. Ya no, a propósito:
  // lo que ya entró a un corte se puede pagar antes de la fecha límite, y eso
  // bajaba el saldo y disparaba «falta registrar un gasto» sin que faltara nada.
  it('pagar el estado de cuenta antes de la fecha límite no dispara la alerta', () => {
    const bbva = card({ cut_day: 15, payment_due_day: 5 })
    const plan = msi({ start_date: '2026-10-03' })
    // 20 oct: la 1ª ($1,000) ya está en el estado del 15 oct; el usuario la paga.
    expect(getMsiUncovered({ ...bbva, balance: 11000 }, [plan], '2026-10-20')).toBe(0)
    // Pero si al saldo le falta lo que aún no se cobra, sí se avisa.
    expect(getMsiUncovered({ ...bbva, balance: 9000 }, [plan], '2026-10-20')).toBe(2000)
  })
})

describe('getDeudaALaVista', () => {
  it('por tarjeta: el saldo menos el MSI que aún no se cobra', () => {
    const bbva = card({ cut_day: 15, payment_due_day: 5, balance: 15000 })
    const plan = msi({ start_date: '2026-10-03' })
    // 20 oct: 11,000 aún no se cobran → a la vista 4,000 (incluye la 1ª mensualidad).
    expect(getDeudaALaVista([bbva], [plan], '2026-10-20')).toBe(4000)
  })

  it('un plan sin tarjeta no se resta de las tarjetas; suma sólo lo que ya toca', () => {
    const bbva = card({ balance: 5000 })
    const suelto = msi({ account_id: null, start_date: '2026-10-03' })
    expect(getDeudaALaVista([bbva], [suelto], '2026-10-03')).toBe(6000)
  })
})

describe('getExigibleEsteCiclo — por fechas', () => {
  it('cuando el plan terminó, ya no suma', () => {
    const bbva = card({ cut_day: 15, payment_due_day: 5, balance: 0, cost_type: 'sin_costo' })
    const corto = msi({ start_date: '2026-01-03', months_total: 3, total_amount: 3000 })
    expect(getExigibleEsteCiclo(bbva, [corto], '2026-10-20')).toBe(0)
  })
})
