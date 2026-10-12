import { describe, expect, it } from 'vitest'
import {
  calendarioMsi,
  cargoObjetivo,
  conMarca,
  liquidarMarcas,
  marcasEfectivas,
  montoDeMes,
  nuevoCargo,
  sugerirFechaDeCompra,
} from './msi'
import type { CicloTarjeta } from './cardCycle'
import type { Installment } from '@/types'

const plan = (p: Partial<Installment> = {}): Installment => ({
  id: 'i1', user_id: 'u', account_id: 'c1', name: 'iPhone',
  total_amount: 12000, monthly_amount: 1000, months_total: 12, months_paid: 0,
  start_date: '2026-10-03', status: 'active', is_zero_interest: true,
  created_at: '2026-10-03T18:00:00Z', updated_at: '', month_status: { _v: 2 }, billing_offset: 0,
  ...p,
})
const bbva: CicloTarjeta = { type: 'credit', cut_day: 15, payment_due_day: 5, payment_grace_days: null }

describe('fechas de cada mensualidad', () => {
  it('compra antes del corte: la 1ª entra en ese corte y vence en la fecha de pago siguiente', () => {
    const c = calendarioMsi(plan(), bbva, '2026-10-03')
    expect(c.meses[0]).toMatchObject({ n: 1, corte: '2026-10-15', vence: '2026-11-05', estado: 'proxima' })
    expect(c.meses[1]).toMatchObject({ corte: '2026-11-15', vence: '2026-12-05' })
    expect(c.termina).toBe('2027-10-05')
  })

  it('compra el día del corte entra en ese corte; al día siguiente, en el próximo', () => {
    expect(calendarioMsi(plan({ start_date: '2026-10-15' }), bbva, '2026-10-15').meses[0].corte).toBe('2026-10-15')
    expect(calendarioMsi(plan({ start_date: '2026-10-16' }), bbva, '2026-10-16').meses[0].corte).toBe('2026-11-15')
  })

  it('«empieza a pagar en 2 meses» recorre la primera mensualidad', () => {
    expect(calendarioMsi(plan({ billing_offset: 2 }), bbva, '2026-10-03').meses[0].corte).toBe('2026-12-15')
  })

  it('compra el 28 feb con corte 30: entra el 28 (recortado) de febrero', () => {
    const c30: CicloTarjeta = { ...bbva, cut_day: 30 }
    expect(calendarioMsi(plan({ start_date: '2027-02-28' }), c30, '2027-02-28').meses[0].corte).toBe('2027-02-28')
  })

  it('tarjeta sin regla de pago: se estima a 20 días y se dice', () => {
    const m = calendarioMsi(plan(), { ...bbva, payment_due_day: null }, '2026-10-03').meses[0]
    expect(m).toMatchObject({ vence: '2026-11-04', venceEstimado: true })
  })

  it('sin tarjeta: vence cada mes desde la compra, recortando el 31', () => {
    const c = calendarioMsi(plan({ start_date: '2027-01-31', account_id: null }), null, '2027-01-31')
    expect(c.meses[0]).toMatchObject({ corte: null, vence: '2027-02-28' })
    expect(c.meses[1].vence).toBe('2027-03-31')
  })
})

describe('avanza sola con el calendario', () => {
  it('entre el corte y la fecha de pago, está en tu estado de cuenta', () => {
    const c = calendarioMsi(plan(), bbva, '2026-10-15')
    expect(c.meses[0].estado).toBe('por-pagar')
    expect(c.actual?.n).toBe(1)
  })

  it('el día de pago todavía no cuenta como pagada; al día siguiente, sí', () => {
    expect(calendarioMsi(plan(), bbva, '2026-11-05').meses[0].estado).toBe('por-pagar')
    const despues = calendarioMsi(plan(), bbva, '2026-11-06')
    expect(despues.meses[0]).toMatchObject({ estado: 'pagada', origen: 'auto' })
    expect(despues.pagadas).toBe(1)
  })

  it('«mensualidad 4 de 12» tres meses después', () => {
    const c = calendarioMsi(plan(), bbva, '2027-01-20')
    expect(c.pagadas).toBe(3)
    expect(c.actual).toMatchObject({ n: 4, estado: 'por-pagar', vence: '2027-02-05' })
    expect(c.restante).toBe(9000)
  })

  it('al terminar el plazo, el plan termina solo', () => {
    const c = calendarioMsi(plan(), bbva, '2027-10-06')
    expect(c.terminado).toBe(true)
    expect(c.restante).toBe(0)
    expect(c.actual).toBeNull()
  })

  it('con gracia de 60 días puede haber dos mensualidades en el estado de cuenta', () => {
    const plata: CicloTarjeta = { type: 'credit', cut_day: 10, payment_grace_days: 60, payment_due_day: null }
    const c = calendarioMsi(plan({ start_date: '2026-09-01' }), plata, '2026-10-20')
    expect(c.meses.filter((m) => m.estado === 'por-pagar').map((m) => m.n)).toEqual([1, 2])
  })
})

describe('dinero', () => {
  it('la última mensualidad absorbe el redondeo: sin pagos, el restante es el total exacto', () => {
    const p = plan({ total_amount: 574.5, monthly_amount: 143.63, months_total: 4 })
    expect(montoDeMes(p, 4)).toBe(143.61)
    expect(calendarioMsi(p, bbva, '2026-10-03').restante).toBe(574.5)
    const t = plan({ total_amount: 1000, monthly_amount: 333.33, months_total: 3 })
    expect(calendarioMsi(t, bbva, '2026-10-03').restante).toBe(1000)
  })

  it('separa lo que ya está en un estado de cuenta de lo que aún no se cobra', () => {
    const c = calendarioMsi(plan(), bbva, '2026-10-20')
    expect(c.enEstado).toBe(1000)
    expect(c.porFacturar).toBe(11000)
  })

  it('acepta números que llegan como texto desde la base', () => {
    const p = plan({ total_amount: '18000' as unknown as number, monthly_amount: '1500' as unknown as number, months_total: '12' as unknown as number })
    expect(calendarioMsi(p, bbva, '2026-10-03').restante).toBe(18000)
  })

  it('sin fecha de inicio, usa el día en que se registró', () => {
    const c = calendarioMsi(plan({ start_date: '' }), bbva, '2026-10-03')
    expect(c.meses[0].corte).toBe('2026-10-15')
  })
})

describe('marcas a mano', () => {
  const hoy = '2026-10-20'

  it('pagar antes de tiempo: cuenta como pagada y se nota que fue adelantada', () => {
    const p = plan({ month_status: conMarca(plan(), 2, 'paid', hoy) })
    const c = calendarioMsi(p, bbva, hoy)
    expect(c.meses[1]).toMatchObject({ estado: 'pagada', origen: 'manual', marcadaEl: hoy })
    expect(c.adelantadas).toBe(1)
    expect(c.porFacturar).toBe(10000)
  })

  it('«no la pagué» después de la fecha límite → vencida', () => {
    const p = plan({ month_status: conMarca(plan(), 1, 'unpaid', '2026-11-06') })
    const c = calendarioMsi(p, bbva, '2026-11-10')
    expect(c.meses[0]).toMatchObject({ estado: 'vencida', origen: 'manual' })
    expect(c.actual?.n).toBe(1)
  })

  it('volver a automático borra la marca, y no deja el objeto vacío', () => {
    const marcado = conMarca(plan(), 2, 'paid', hoy)
    const vuelto = conMarca(plan({ month_status: marcado }), 2, 'auto', hoy)
    expect(vuelto).toEqual({ _v: 2 })
    expect(calendarioMsi(plan({ month_status: vuelto, months_paid: 5 }), bbva, hoy).pagadas).toBe(0)
  })

  it('el progreso del contador viejo se respeta como «anterior»', () => {
    const viejo = plan({ month_status: undefined, months_paid: 3 })
    expect(Object.keys(marcasEfectivas(viejo))).toEqual(['1', '2', '3'])
    const c = calendarioMsi(viejo, bbva, hoy)
    expect(c.pagadas).toBe(3)
    expect(c.meses[0].origen).toBe('anterior')
  })

  it('liquidar el resto marca todas las que faltan', () => {
    const p = plan({ month_status: liquidarMarcas(plan(), bbva, hoy) })
    expect(calendarioMsi(p, bbva, hoy)).toMatchObject({ terminado: true, restante: 0 })
  })

  it('marcas de meses que ya no existen se ignoran', () => {
    const p = plan({ months_total: 3, total_amount: 3000, month_status: { _v: 2, '7': { s: 'paid', at: hoy } } })
    expect(calendarioMsi(p, bbva, hoy).pagadas).toBe(0)
  })

  it('sugiere una fecha de compra cuando las marcas no cuadran con las fechas', () => {
    // Plan viejo: «inicio» = el día del registro, con 3 pagos ya hechos.
    const viejo = plan({ start_date: '2026-10-03', month_status: undefined, months_paid: 3 })
    // Dos de las tres marcas caen antes de su corte: se propone comprar dos meses antes.
    const propuesta = sugerirFechaDeCompra(viejo, bbva, '2026-10-20')
    expect(propuesta).toBe('2026-08-03')
    // Con esa fecha, las marcas ya cuadran.
    expect(calendarioMsi({ ...viejo, start_date: propuesta! }, bbva, '2026-10-20').adelantadas).toBe(0)
    expect(sugerirFechaDeCompra(plan(), bbva, '2026-10-20')).toBeNull()
  })
})

describe('cargo a la tarjeta al editar', () => {
  const reg = '2026-10-03'

  it('cambiar el total mueve el cargo por la diferencia', () => {
    const antes = plan()
    const despues = plan({ total_amount: 12500, monthly_amount: 1041.67 })
    expect(nuevoCargo(12000, [antes, bbva], [despues, bbva], reg)).toBe(12500)
  })

  it('cambiar sólo el plazo no mueve el cargo', () => {
    const despues = plan({ months_total: 18, monthly_amount: 666.67 })
    expect(nuevoCargo(12000, [plan(), bbva], [despues, bbva], reg)).toBe(12000)
  })

  it('con pagos ya hechos no se restan dos veces', () => {
    // La tarjeta ya bajó por los pagos; el cargo sigue siendo el original.
    expect(nuevoCargo(12000, [plan({ months_paid: 4 }), bbva], [plan({ months_paid: 4, total_amount: 12000 }), bbva], reg)).toBe(12000)
  })

  it('una compra más vieja: las mensualidades ya vencidas al registrar no se cargan', () => {
    const vieja = plan({ start_date: '2026-07-03' })
    expect(cargoObjetivo(vieja, bbva, reg)).toBe(10000) // vencieron 5 ago y 5 sep
    expect(nuevoCargo(12000, [plan(), bbva], [vieja, bbva], reg)).toBe(10000)
  })
})
