import { describe, expect, it } from 'vitest'
import {
  corteEn,
  corteMas,
  primerCorteDesde,
  proximoVencimiento,
  tieneVencimiento,
  venceDelCorte,
  vencimientosEntre,
  type CicloTarjeta,
} from './cardCycle'
import { fromKey, toKey } from './localDate'

const tarjeta = (c: Partial<CicloTarjeta>): CicloTarjeta => ({
  type: 'credit', cut_day: null, payment_due_day: null, payment_grace_days: null, ...c,
})
const k = (d: Date | null | undefined) => (d ? toKey(d) : null)

describe('corte', () => {
  const c31 = tarjeta({ cut_day: 31, payment_due_day: 20 })

  it('el día 31 se recorta al largo de cada mes, sin arrastrar el recorte', () => {
    const ene = corteEn(c31, 2028, 0)!
    expect(k(ene)).toBe('2028-01-31')
    expect(k(corteMas(c31, ene, 1))).toBe('2028-02-29') // bisiesto
    expect(k(corteMas(c31, ene, 2))).toBe('2028-03-31')
    expect(k(corteMas(c31, corteEn(c31, 2027, 0)!, 1))).toBe('2027-02-28')
  })

  it('una compra el día del corte entra en ese corte; al día siguiente, en el próximo', () => {
    const c = tarjeta({ cut_day: 15, payment_due_day: 5 })
    expect(k(primerCorteDesde(c, fromKey('2026-10-15')))).toBe('2026-10-15')
    expect(k(primerCorteDesde(c, fromKey('2026-10-16')))).toBe('2026-11-15')
    expect(k(primerCorteDesde(c, fromKey('2026-12-20')))).toBe('2027-01-15')
  })

  it('sin día de corte no hay corte', () => {
    expect(primerCorteDesde(tarjeta({ payment_due_day: 5 }), fromKey('2026-10-01'))).toBeNull()
  })
})

describe('fecha de pago de un corte', () => {
  const vence = (c: Partial<CicloTarjeta>, corte: string) => {
    const r = venceDelCorte(tarjeta(c), fromKey(corte))
    return { vence: toKey(r.vence), estimado: r.estimado }
  }

  it('día fijo: el primero estrictamente después del corte', () => {
    expect(vence({ cut_day: 15, payment_due_day: 5 }, '2026-10-15').vence).toBe('2026-11-05')
    expect(vence({ cut_day: 1, payment_due_day: 20 }, '2026-10-01').vence).toBe('2026-10-20')
    expect(vence({ cut_day: 28, payment_due_day: 28 }, '2026-10-28').vence).toBe('2026-11-28')
    expect(vence({ cut_day: 10, payment_due_day: 31 }, '2027-02-10').vence).toBe('2027-02-28')
  })

  it('días de gracia: corte + N días, aunque haya día fijo', () => {
    expect(vence({ cut_day: 10, payment_grace_days: 20, payment_due_day: 5 }, '2026-10-10').vence).toBe('2026-10-30')
  })

  it('sin regla de pago se estima a 20 días, y se dice', () => {
    expect(vence({ cut_day: 10 }, '2026-10-10')).toEqual({ vence: '2026-10-30', estimado: true })
    expect(tieneVencimiento(tarjeta({ cut_day: 10 }))).toBe(false)
  })
})

describe('vencimientosEntre', () => {
  it('con gracia de 60 días no se pierde el pago de un corte de hace dos meses', () => {
    // Corte 5 de agosto + 60 días = 4 de octubre. El código anterior lo perdía.
    const plata = tarjeta({ cut_day: 5, payment_grace_days: 60 })
    const fechas = vencimientosEntre(plata, fromKey('2026-10-01'), fromKey('2026-10-31')).map((v) => k(v.vence))
    expect(fechas).toEqual(['2026-10-04'])
  })

  it('día fijo sin corte: una fecha por mes', () => {
    const c = tarjeta({ payment_due_day: 5 })
    const fechas = vencimientosEntre(c, fromKey('2026-10-01'), fromKey('2026-12-31')).map((v) => k(v.vence))
    expect(fechas).toEqual(['2026-10-05', '2026-11-05', '2026-12-05'])
  })

  it('las débito no tienen fechas', () => {
    expect(vencimientosEntre({ ...tarjeta({ payment_due_day: 5 }), type: 'debit' }, fromKey('2026-10-01'), fromKey('2026-12-31'))).toEqual([])
  })
})

describe('proximoVencimiento', () => {
  it('corte 10, gracia 20, hoy 5 oct → 30 oct (antes decía 30 nov)', () => {
    const c = tarjeta({ cut_day: 10, payment_grace_days: 20 })
    expect(k(proximoVencimiento(c, fromKey('2026-10-05'))?.vence)).toBe('2026-10-30')
  })

  it('gracia 60, hoy 1 nov → 9 nov, del corte del 10 sep', () => {
    const c = tarjeta({ cut_day: 10, payment_grace_days: 60 })
    const p = proximoVencimiento(c, fromKey('2026-11-01'))
    expect(k(p?.vence)).toBe('2026-11-09')
    expect(k(p?.corte)).toBe('2026-09-10')
  })

  it('el mismo día de pago todavía cuenta', () => {
    const c = tarjeta({ cut_day: 15, payment_due_day: 5 })
    expect(k(proximoVencimiento(c, fromKey('2026-11-05'))?.vence)).toBe('2026-11-05')
  })
})

describe('día fijo con corte, en febrero', () => {
  it('una fecha de pago por mes aunque febrero recorte corte y pago', () => {
    const c = tarjeta({ cut_day: 29, payment_due_day: 30 })
    const fechas = vencimientosEntre(c, fromKey('2027-01-01'), fromKey('2027-04-30')).map((v) => k(v.vence))
    expect(fechas).toEqual(['2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30'])
  })

  it('gracia 0 (filas viejas): se paga el día del corte', () => {
    const c = tarjeta({ cut_day: 10, payment_grace_days: 0 })
    expect(k(proximoVencimiento(c, fromKey('2026-10-05'))?.vence)).toBe('2026-10-10')
  })
})
