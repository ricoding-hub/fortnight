import { describe, expect, it } from 'vitest'
import {
  compraParecida,
  cortesParaEstados,
  estadosDeCuenta,
  pagosProyectados,
  planEdc,
  ventanaDeMovimientos,
  type MovEdc,
  type TarjetaEdc,
} from './estadoDeCuenta'
import type { Installment } from '@/types'

/*
 * El caso de Tony, con números redondos: tarjeta MP con corte 15 y pago 5.
 * Compras normales de 1,500 (16 sep) y 2,500 (10 oct), y un MSI de 6,000 a 6
 * meses comprado el 20 sep y cargado a la tarjeta. Saldo 10,000.
 * Lo que diría el banco el 5 nov: pago para no generar intereses = 5,000
 * (4,000 normales + la 1ª mensualidad).
 */
const MP: TarjetaEdc = {
  id: 'mp', name: 'MercadoPago', type: 'credit', balance: 10000, credit_limit: 20000,
  cut_day: 15, payment_due_day: 5, payment_grace_days: null, min_payment_pct: null,
  created_at: '2026-01-10T18:00:00Z',
}
const mov = (id: string, amount: number, date: string, extra: Partial<MovEdc> = {}): MovEdc => ({
  id, account_id: 'mp', amount, date, type: 'transaction', ...extra,
})
const BASE: MovEdc[] = [
  mov('t1', 1500, '2026-09-16'),
  mov('msi', 6000, '2026-09-20', { type: 'installment', installment_id: 'p1' }),
  mov('t2', 2500, '2026-10-10'),
]
const PLAN: Installment = {
  id: 'p1', user_id: 'u', account_id: 'mp', name: 'Tele', total_amount: 6000, monthly_amount: 1000,
  months_total: 6, months_paid: 0, start_date: '2026-09-20', status: 'active', is_zero_interest: true,
  created_at: '2026-09-20T18:00:00Z', updated_at: '', month_status: { _v: 2 }, billing_offset: 0,
}
const CARGO = { id: 'msi', amount: 6000, account_id: 'mp', date: '2026-09-20' }

function calcular(o: {
  hoy?: string
  balance?: number
  movs?: MovEdc[]
  plan?: Installment | null
  cargo?: typeof CARGO | null
  tarjeta?: Partial<TarjetaEdc>
  correcciones?: Parameters<typeof estadosDeCuenta>[0]['correcciones']
} = {}) {
  const hoy = o.hoy ?? '2026-11-05'
  const tarjeta = { ...MP, balance: o.balance ?? MP.balance, ...o.tarjeta }
  const planes = o.plan === null ? [] : [planEdc(o.plan ?? PLAN, tarjeta, o.cargo === undefined ? CARGO : o.cargo, hoy)]
  const e = estadosDeCuenta({ tarjetas: [tarjeta], movs: o.movs ?? BASE, planes, correcciones: o.correcciones ?? [], hoy })
  return { e: e.mp, tarjeta, planes, hoy }
}
const delCorte = (e: ReturnType<typeof calcular>['e'], corte: string) => e.estados.find((s) => s.corte === corte)!

describe('estado de cuenta — el caso de Tony', () => {
  it('pago para no generar intereses = compras normales + la mensualidad, no el saldo completo', () => {
    const { e } = calcular()
    const oct = delCorte(e, '2026-10-15')
    expect(oct).toMatchObject({
      saldoAlCorte: 10000, msiNoFacturado: 5000, msiDelCorte: 1000, pngi: 5000, falta: 5000,
      minimo: 1250, estado: 'pendiente', vence: '2026-11-05',
    })
    expect(e.proximo?.corte).toBe('2026-10-15')
    expect(delCorte(e, '2026-09-15').estado).toBe('sin-saldo')
    expect(e.siguiente).toEqual({ corte: '2026-11-15', vence: '2026-12-05', estimado: 1000 })
  })

  it('al pagarlo, ya no falta nada y el aviso no tiene qué decir', () => {
    const { e } = calcular({
      balance: 5000,
      movs: [...BASE, mov('p', -5000, '2026-11-05', { type: 'transfer', transfer_id: 'x' })],
    })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ saldoAlCorte: 10000, pagado: 5000, falta: 0, estado: 'pagado' })
    expect(e.proximo).toBeNull()
  })

  it('un pago parcial deja lo que falta, y vencido al día siguiente', () => {
    const movs = [...BASE, mov('p', -4500, '2026-11-05')]
    const hoy = calcular({ balance: 5500, movs })
    expect(delCorte(hoy.e, '2026-10-15')).toMatchObject({ falta: 500, minimoFalta: 0, estado: 'pendiente' })
    const manana = calcular({ balance: 5500, movs, hoy: '2026-11-06' })
    expect(manana.e.proximo).toMatchObject({ corte: '2026-10-15', estado: 'vencido', falta: 500 })
    // Pasado el siguiente corte, esa deuda vive en el estado nuevo: 500 + la 2ª mensualidad.
    const despues = calcular({ balance: 5500, movs, hoy: '2026-11-16' })
    expect(delCorte(despues.e, '2026-10-15').absorbido).toBe(true)
    expect(delCorte(despues.e, '2026-11-15').pngi).toBe(1500)
  })

  it('una compra después del corte va al siguiente estado', () => {
    const { e } = calcular({ balance: 12000, movs: [...BASE, mov('t3', 2000, '2026-10-20')] })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ pngi: 5000, compras: 2000 })
    expect(e.siguiente?.estimado).toBe(3000)
  })

  it('pagar antes del corte baja el pago de ese estado', () => {
    const { e } = calcular({ balance: 7000, movs: [...BASE, mov('p', -3000, '2026-10-10')] })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ pngi: 2000, falta: 2000 })
  })

  it('el saldo a favor cubre la siguiente mensualidad', () => {
    const movs = [...BASE, mov('p', -6000, '2026-11-01')]
    expect(delCorte(calcular({ balance: 4000, movs }).e, '2026-10-15').falta).toBe(0)
    const nov = delCorte(calcular({ balance: 4000, movs, hoy: '2026-11-16' }).e, '2026-11-15')
    expect(nov).toMatchObject({ saldoAlCorte: 4000, msiNoFacturado: 4000, estado: 'sin-saldo' })
  })

  it('reembolsos y ajustes: a la baja abonan, al alza son compras nuevas', () => {
    expect(delCorte(calcular({ balance: 9200, movs: [...BASE, mov('r', -800, '2026-10-25')] }).e, '2026-10-15').falta).toBe(4200)
    const alza = delCorte(
      calcular({ balance: 11000, movs: [...BASE, mov('a', 1000, '2026-10-20', { type: 'adjustment' })] }).e,
      '2026-10-15',
    )
    expect(alza).toMatchObject({ pngi: 5000, ajustesAlAlza: 1000 })
    const baja = delCorte(
      calcular({ balance: 5000, movs: [...BASE, mov('a', -5000, '2026-11-03', { type: 'adjustment' })] }).e,
      '2026-10-15',
    )
    expect(baja.falta).toBe(0)
  })

  it('un cargo MSI registrado después del corte no se cuenta en ese estado', () => {
    const movs = [mov('t1', 1500, '2026-09-16'), mov('t2', 2500, '2026-10-10'), mov('msi', 6000, '2026-10-21', { type: 'installment' })]
    const { e } = calcular({ movs, cargo: { ...CARGO, date: '2026-10-21' } })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ saldoAlCorte: 4000, msiNoFacturado: 0, pngi: 4000 })
  })

  it('un MSI que no está en el saldo se avisa como aproximado', () => {
    const { e } = calcular({ balance: 4000, movs: [mov('t1', 1500, '2026-09-16'), mov('t2', 2500, '2026-10-10')], cargo: null })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ pngi: 0, aproximado: 'msi-sin-respaldo' })
  })

  it('una mensualidad pagada por adelantado antes del corte ya no está en el saldo', () => {
    const plan = { ...PLAN, month_status: { _v: 2, '5': { s: 'paid', at: '2026-10-10' } } }
    const { e } = calcular({ plan, balance: 9000, movs: [...BASE, mov('p', -1000, '2026-10-10')] })
    // El adelanto bajó el saldo y la mensualidad 5: no se resta dos veces.
    expect(delCorte(e, '2026-10-15')).toMatchObject({ msiNoFacturado: 4000, pngi: 5000 })
  })

  it('marcada DESPUÉS del corte, en ese corte todavía estaba en el saldo', () => {
    const plan = { ...PLAN, month_status: { _v: 2, '5': { s: 'paid', at: '2026-10-20' } } }
    const { e } = calcular({ plan })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ msiNoFacturado: 5000, pngi: 5000 })
  })

  it('un plan liquidado ya no baja el pago de los cortes siguientes', () => {
    // 1 nov: paga el estado de oct (5,000) y liquida el resto del MSI (5,000).
    // Antes del corte del 15 nov compra 8,000. El banco pide 8,000, no 4,000.
    const marcas: Record<string, unknown> = { _v: 2 }
    for (const n of [1, 2, 3, 4, 5, 6]) marcas[n] = { s: 'paid', at: '2026-11-01' }
    const plan = { ...PLAN, month_status: marcas }
    const { e } = calcular({
      plan,
      hoy: '2026-11-20',
      balance: 8000,
      movs: [...BASE, mov('p', -10000, '2026-11-01', { type: 'transfer', transfer_id: 'x' }), mov('c', 8000, '2026-11-10')],
    })
    expect(delCorte(e, '2026-11-15')).toMatchObject({ saldoAlCorte: 8000, msiNoFacturado: 0, pngi: 8000, falta: 8000 })
    // El de octubre quedó pagado con ese mismo pago.
    expect(delCorte(e, '2026-10-15')).toMatchObject({ pngi: 5000, falta: 0, estado: 'pagado' })
  })

  it('sin marcas a mano (sin la migración 036), el ajuste de «Liquidar» cuenta completo', () => {
    const { e } = calcular({
      balance: 4000,
      movs: [...BASE, mov('liq', -6000, '2026-11-01', { type: 'adjustment', installment_id: 'p1' })],
      plan: { ...PLAN, month_status: undefined, months_paid: 6, status: 'paid' },
    })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ pagado: 6000 })
  })

  it('la cifra del banco manda sobre el cálculo', () => {
    const { e } = calcular({
      balance: 5000,
      movs: [...BASE, mov('p', -5000, '2026-11-04')],
      correcciones: [{ account_id: 'mp', cut_date: '2026-10-15', no_interest_amount: '5200', min_amount: null }],
    })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ pngi: 5200, corregido: true, falta: 200, estado: 'pendiente' })
  })
})

describe('estado de cuenta — casos de borde', () => {
  // Plata: corte 15 y 60 días de gracia. Dos estados abiertos a la vez.
  const plata = { cut_day: 15, payment_due_day: null, payment_grace_days: 60 }
  const movsPlata = [mov('a', 3000, '2026-09-10'), mov('b', 2000, '2026-10-01')]

  it('con gracia larga hay dos estados abiertos y cada uno se calcula solo', () => {
    const { e } = calcular({ tarjeta: plata, balance: 5000, movs: movsPlata, plan: null, hoy: '2026-11-01' })
    expect(delCorte(e, '2026-09-15')).toMatchObject({ pngi: 3000, vence: '2026-11-14', estado: 'pendiente' })
    expect(delCorte(e, '2026-10-15')).toMatchObject({ pngi: 5000, vence: '2026-12-14' })
    expect(e.proximo?.corte).toBe('2026-09-15')

    const pagado = calcular({
      tarjeta: plata, balance: 2000, plan: null, hoy: '2026-11-01',
      movs: [...movsPlata, mov('p', -3000, '2026-10-20')],
    })
    expect(delCorte(pagado.e, '2026-09-15').falta).toBe(0)
    expect(delCorte(pagado.e, '2026-10-15').falta).toBe(2000)
    expect(pagado.e.proximo?.corte).toBe('2026-10-15')

    const despues = calcular({ tarjeta: plata, balance: 5000, movs: movsPlata, plan: null, hoy: '2026-11-20' })
    expect(delCorte(despues.e, '2026-09-15').absorbido).toBe(true)
  })

  it('una cuenta dada de alta después del corte es aproximada', () => {
    const { e } = calcular({ tarjeta: { created_at: '2026-10-20T18:00:00Z' } })
    expect(delCorte(e, '2026-10-15').aproximado).toBe('alta')
  })

  it('sin día de corte no se inventa un estado', () => {
    const { e } = calcular({ tarjeta: { cut_day: null } })
    expect(e).toMatchObject({ sinCorte: true, estados: [], proximo: null })
  })

  it('corte día 31: el 28 de febrero está dentro, el 1 de marzo fuera', () => {
    const { e } = calcular({
      tarjeta: { cut_day: 31, payment_due_day: 20 },
      plan: null,
      balance: 300,
      movs: [mov('a', 100, '2027-02-28'), mov('b', 200, '2027-03-01')],
      hoy: '2027-03-05',
    })
    expect(delCorte(e, '2027-02-28').saldoAlCorte).toBe(100)
  })

  it('con planes largos, la ventana llega más atrás (hasta 40 cortes)', () => {
    const cortes = cortesParaEstados(MP, '2028-01-20', '2026-08-16')
    expect(cortes[0]).toBe('2026-09-15')
    expect(cortes).toHaveLength(17)
  })

  it('la ventana de movimientos: la gracia y dos ciclos más', () => {
    expect(ventanaDeMovimientos([MP], '2026-11-05')).toBe('2026-08-15')
    expect(cortesParaEstados(MP, '2026-11-05')).toEqual(['2026-08-15', '2026-09-15', '2026-10-15'])
    expect(ventanaDeMovimientos([{ ...MP, cut_day: null }], '2026-11-05')).toBeNull()
  })

  it('montos que llegan como texto desde la base', () => {
    const { e } = calcular({ balance: '10000' as unknown as number, movs: BASE.map((m) => ({ ...m, amount: String(m.amount) })) })
    expect(delCorte(e, '2026-10-15').pngi).toBe(5000)
  })
})

describe('pagosProyectados', () => {
  it('cada fecha de pago lleva lo suyo, sin contar dos veces', () => {
    const { e, tarjeta, planes } = calcular({ hoy: '2026-11-01' })
    const pagos = pagosProyectados(e, tarjeta, planes, '2027-01-31', '2026-11-01')
    expect(pagos.map((p) => [p.vence, p.monto])).toEqual([
      ['2026-11-05', 5000],
      ['2026-12-05', 1000],
      ['2027-01-05', 1000],
    ])
  })

  it('lo ya pagado sale en 0', () => {
    const { e, tarjeta, planes } = calcular({
      hoy: '2026-11-01', balance: 5000, movs: [...BASE, mov('p', -5000, '2026-11-01')],
    })
    const pagos = pagosProyectados(e, tarjeta, planes, '2026-12-31', '2026-11-01')
    expect(pagos[0]).toMatchObject({ vence: '2026-11-05', monto: 0, estado: 'pagado' })
    expect(pagos[1]).toMatchObject({ vence: '2026-12-05', monto: 1000 })
  })

  it('con dos estados abiertos, el segundo sólo suma lo suyo', () => {
    const tarjeta = { cut_day: 15, payment_due_day: null, payment_grace_days: 60 }
    const { e, tarjeta: t, planes } = calcular({
      tarjeta, balance: 5000, plan: null, hoy: '2026-11-01',
      movs: [mov('a', 3000, '2026-09-10'), mov('b', 2000, '2026-10-01')],
    })
    const pagos = pagosProyectados(e, t, planes, '2026-12-31', '2026-11-01')
    expect(pagos.filter((p) => p.vence >= '2026-11-01').map((p) => [p.vence, p.monto])).toEqual([
      ['2026-11-14', 3000],
      ['2026-12-14', 2000],
    ])
  })
})

describe('compraParecida', () => {
  const movs = [mov('nu', 6000, '2026-10-18'), mov('ya', 6000, '2026-10-19', { installment_id: 'p9' })]
  it('encuentra el gasto ya registrado (±$1, ±3 días)', () => {
    expect(compraParecida(movs, { accountId: 'mp', total: 6000, fecha: '2026-10-20' })?.id).toBe('nu')
  })
  it('no confunde montos distintos ni gastos que ya son de un plan', () => {
    expect(compraParecida(movs, { accountId: 'mp', total: 6002, fecha: '2026-10-20' })).toBeNull()
    expect(compraParecida([movs[1]], { accountId: 'mp', total: 6000, fecha: '2026-10-20' })).toBeNull()
  })
})
