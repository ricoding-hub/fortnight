import { describe, expect, it } from 'vitest'
import { clasificar, efectoEnPatrimonio, montoEnCuenta, resumenDeMovimientos } from './movimiento'

const debito = { type: 'debit' as const }
const credito = { type: 'credit' as const }
const tx = (amount: number, type: 'transaction' | 'adjustment' | 'installment' | 'transfer' = 'transaction') => ({ amount, type })

describe('clasificar', () => {
  it('en débito: negativo es gasto, positivo es ingreso', () => {
    expect(clasificar(tx(-450), debito)).toBe('gasto')
    expect(clasificar(tx(9800), debito)).toBe('ingreso')
  })

  it('en tarjeta: una compra es gasto, aunque el número sea positivo', () => {
    expect(clasificar(tx(2000), credito)).toBe('gasto')
    expect(efectoEnPatrimonio(tx(2000), credito)).toBe(-2000)
  })

  it('el «Ingreso con Salario» de antes en una tarjeta es un pago, no un ingreso', () => {
    expect(clasificar(tx(-5000), credito, { kind: 'income' })).toBe('pago-tarjeta')
    expect(clasificar(tx(-5000), credito, null)).toBe('pago-tarjeta')
    expect(efectoEnPatrimonio(tx(-5000), credito)).toBe(5000)
  })

  it('una devolución en tarjeta con categoría de gasto es reembolso', () => {
    expect(clasificar(tx(-800), credito, { kind: 'variable' })).toBe('reembolso')
  })

  it('los tipos especiales', () => {
    expect(clasificar(tx(6000, 'installment'), credito)).toBe('cargo-msi')
    expect(clasificar(tx(-100, 'adjustment'), debito)).toBe('ajuste')
    expect(clasificar(tx(-5000, 'transfer'), credito)).toBe('pago-tarjeta')
    expect(clasificar(tx(-5000, 'transfer'), debito)).toBe('transferencia')
  })
})

describe('montoEnCuenta', () => {
  it('pagar con tarjeta SUBE su deuda; con débito, baja el saldo', () => {
    expect(montoEnCuenta(credito, 'sale', 100)).toBe(100)
    expect(montoEnCuenta(credito, 'entra', 100)).toBe(-100)
    expect(montoEnCuenta(debito, 'sale', 100)).toBe(-100)
    expect(montoEnCuenta(debito, 'entra', 100)).toBe(100)
    expect(montoEnCuenta(null, 'sale', -100)).toBe(-100)
  })
})

describe('resumenDeMovimientos', () => {
  it('salario, compra con tarjeta y pago de tarjeta (dos partes) — cada cosa en su lugar', () => {
    const cuentas = new Map<string, { type: 'debit' | 'credit' }>([['bbva', debito], ['nu', credito]])
    const cats = new Map<string, { kind: 'income' | 'variable' }>([['sal', { kind: 'income' }], ['com', { kind: 'variable' }]])
    const r = resumenDeMovimientos(
      [
        { amount: 9800, type: 'transaction', account_id: 'bbva', category_id: 'sal', date: '2026-10-01' },
        { amount: 2000, type: 'transaction', account_id: 'nu', category_id: 'com', date: '2026-10-02' },
        { amount: -5000, type: 'transfer', account_id: 'nu', category_id: null, date: '2026-10-03', transfer_id: 'x' },
        { amount: -5000, type: 'transfer', account_id: 'bbva', category_id: null, date: '2026-10-03', transfer_id: 'x' },
      ],
      cuentas,
      cats,
    )
    expect(r).toEqual({ ingresos: 9800, gastos: 2000, pagosTarjeta: 5000, cambioPatrimonio: 7800, registros: 2 })
  })
})
