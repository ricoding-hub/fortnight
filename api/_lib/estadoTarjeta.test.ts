import { describe, expect, it } from 'vitest'
import { faltaDelEstado, msiNoFacturado, type PlanFila } from './estadoTarjeta'

/*
 * El mismo caso que src/lib/estadoDeCuenta.test.ts: MP con corte 15 y pago 5,
 * compras de 1,500 y 2,500 y un MSI de 6,000/6 del 20 sep. Saldo 10,000. El
 * banco pide 5,000 para no generar intereses el 5 nov.
 */
const PLAN: PlanFila = {
  id: 'p1', total_amount: '6000', monthly_amount: '1000', months_total: 6, months_paid: 0,
  start_date: '2026-09-20', created_at: '2026-09-20T18:00:00Z', month_status: { _v: 2 }, billing_offset: 0, status: 'active',
}
const CARGOS = new Map([['p1', '2026-09-20']])
const base = { saldo: 10000, planes: [PLAN], cargos: CARGOS, cutDay: 15, corte: '2026-10-15', banco: null }

describe('el aviso del cron usa el mismo estado de cuenta que la app', () => {
  it('lo que aún no se cobra de los MSI no se pide', () => {
    expect(msiNoFacturado([PLAN], CARGOS, 15, '2026-10-15')).toBe(5000)
    expect(faltaDelEstado({ ...base, movs: [] })).toEqual({ pngi: 5000, pagado: 0, falta: 5000 })
  })

  it('quien pagó justo lo que tocaba ya no recibe «Hoy vence»', () => {
    const r = faltaDelEstado({ ...base, saldo: 5000, movs: [{ amount: -5000, date: '2026-11-03' }] })
    expect(r.falta).toBe(0)
  })

  it('un pago parcial deja lo que falta', () => {
    expect(faltaDelEstado({ ...base, saldo: 5500, movs: [{ amount: '-4500', date: '2026-11-03' }] }).falta).toBe(500)
  })

  it('una compra después del corte no cambia lo que toca', () => {
    expect(faltaDelEstado({ ...base, saldo: 12000, movs: [{ amount: 2000, date: '2026-10-20' }] }).falta).toBe(5000)
  })

  it('la cifra del banco manda', () => {
    expect(faltaDelEstado({ ...base, saldo: 5000, banco: 5200, movs: [{ amount: -5000, date: '2026-11-04' }] }).falta).toBe(200)
  })

  it('un plan liquidado antes del corte ya no se resta', () => {
    const marcas: Record<string, unknown> = { _v: 2 }
    for (const n of [1, 2, 3, 4, 5, 6]) marcas[n] = { s: 'paid', at: '2026-11-01' }
    const liquidado = { ...PLAN, month_status: marcas }
    expect(msiNoFacturado([liquidado], CARGOS, 15, '2026-11-15')).toBe(0)
    // En el corte de octubre todavía estaba en el saldo.
    expect(msiNoFacturado([liquidado], CARGOS, 15, '2026-10-15')).toBe(5000)
  })

  it('el progreso del contador viejo no está en el saldo', () => {
    const viejo = { ...PLAN, month_status: null, months_paid: 3 }
    expect(msiNoFacturado([viejo], CARGOS, 15, '2026-10-15')).toBe(3000)
  })

  it('un cargo registrado después del corte no cuenta en ese estado', () => {
    expect(msiNoFacturado([PLAN], new Map([['p1', '2026-10-20']]), 15, '2026-10-15')).toBe(0)
  })

  it('corte 31: febrero se recorta al 28', () => {
    const p = { ...PLAN, start_date: '2027-01-31', months_total: 3, total_amount: 3000 }
    expect(msiNoFacturado([p], new Map(), 31, '2027-02-28')).toBe(1000)
  })
})
