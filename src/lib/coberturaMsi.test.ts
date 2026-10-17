import { describe, expect, it } from 'vitest'
import { coberturaDe, coberturaMsi } from './coberturaMsi'
import { estadosDeCuenta, planEdc, type MovEdc, type TarjetaEdc } from './estadoDeCuenta'
import { calendarioMsi, conMarca, liquidarMarcas, marcasEfectivas } from './msi'
import type { Installment } from '@/types'

/*
 * El caso de Tony (el mismo de estadoDeCuenta.test): MP con corte 15 y pago 5,
 * compras de 1,500 y 2,500 y un MSI de 6,000/6 comprado el 20 sep. La 1ª
 * mensualidad entra en el corte del 15 oct y vence el 5 nov.
 */
const MP: TarjetaEdc = {
  id: 'mp', name: 'MercadoPago', type: 'credit', balance: 10000, credit_limit: 20000,
  cut_day: 15, payment_due_day: 5, payment_grace_days: null, min_payment_pct: null,
  created_at: '2026-01-10T18:00:00Z',
}
const mov = (id: string, amount: number, date: string, extra: Partial<MovEdc> = {}): MovEdc => ({
  id, account_id: 'mp', amount, date, type: 'transaction', ...extra,
})
const pago = (id: string, amount: number, date: string) => mov(id, -amount, date, { type: 'transfer', transfer_id: id })
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

function calendario(o: {
  hoy: string
  pagos?: MovEdc[]
  planes?: { inst: Installment; cargo: typeof CARGO | null }[]
  tarjeta?: Partial<TarjetaEdc>
}) {
  const pagado = (o.pagos ?? []).reduce((s, m) => s + Number(m.amount), 0)
  const tarjeta = { ...MP, balance: MP.balance + pagado, ...o.tarjeta }
  const lista = o.planes ?? [{ inst: PLAN, cargo: CARGO }]
  const planes = lista.map((p) => planEdc(p.inst, tarjeta, p.cargo, o.hoy))
  const estados = estadosDeCuenta({ tarjetas: [tarjeta], movs: [...BASE, ...(o.pagos ?? [])], planes, correcciones: [], hoy: o.hoy })
  const mapa = coberturaMsi(estados, planes)
  const cal = (inst: Installment) => calendarioMsi(inst, tarjeta, o.hoy, coberturaDe(mapa, inst.id))
  return { mapa, cal, tarjeta }
}

describe('una mensualidad la cubren tus pagos, no la fecha', () => {
  it('sin pagos, pasada la fecha límite queda vencida (antes se daba por pagada)', () => {
    const { cal } = calendario({ hoy: '2026-11-06' })
    const c = cal(PLAN)
    expect(c.meses[0]).toMatchObject({ n: 1, estado: 'vencida', origen: 'auto', porPagos: true })
    expect(c.actual?.n).toBe(1)
    expect(c.restante).toBe(6000)
    // Sin cobertura, la fecha la daba por pagada.
    expect(calendarioMsi(PLAN, MP, '2026-11-06').meses[0].estado).toBe('pagada')
  })

  it('antes de la fecha límite y sin pagos, sigue por pagar', () => {
    const { cal } = calendario({ hoy: '2026-11-05' })
    expect(cal(PLAN).meses[0]).toMatchObject({ estado: 'por-pagar', porPagos: true })
  })

  it('pagar el mínimo cubre la mensualidad, como lo aplica el banco', () => {
    const { cal } = calendario({ hoy: '2026-11-06', pagos: [pago('p', 1250, '2026-11-03')] })
    const c = cal(PLAN)
    expect(c.meses[0]).toMatchObject({ estado: 'pagada', origen: 'auto', porPagos: true })
    expect(c.meses[1]).toMatchObject({ estado: 'proxima', porPagos: false })
    expect(c.restante).toBe(5000)
  })

  it('un pago menor a la mensualidad no la cubre', () => {
    const { cal } = calendario({ hoy: '2026-11-06', pagos: [pago('p', 500, '2026-11-03')] })
    expect(cal(PLAN).meses[0].estado).toBe('vencida')
  })

  it('pagarla antes de su fecha límite la marca pagada desde ya', () => {
    const { cal } = calendario({ hoy: '2026-10-25', pagos: [pago('p', 5000, '2026-10-24')] })
    expect(cal(PLAN).meses[0]).toMatchObject({ estado: 'pagada', porPagos: true })
  })

  it('un pago tardío (en el siguiente periodo) también la cubre: el banco aplica a lo más viejo', () => {
    const { cal } = calendario({ hoy: '2026-11-20', pagos: [pago('p', 5000, '2026-11-18')] })
    expect(cal(PLAN).meses[0].estado).toBe('pagada')
  })

  it('la marca a mano gana sobre los pagos', () => {
    const conPago = calendario({ hoy: '2026-11-06', pagos: [pago('p', 5000, '2026-11-03')] })
    const noLaPague = { ...PLAN, month_status: conMarca(PLAN, 1, 'unpaid', '2026-11-06') }
    expect(conPago.cal(noLaPague).meses[0]).toMatchObject({ estado: 'vencida', origen: 'manual', porPagos: false })

    const sinPago = calendario({ hoy: '2026-11-06' })
    const laPague = { ...PLAN, month_status: conMarca(PLAN, 1, 'paid', '2026-11-04') }
    expect(sinPago.cal(laPague).meses[0]).toMatchObject({ estado: 'pagada', origen: 'manual' })
  })

  it('«no la pagué» antes de su fecha también es una marca a mano (se puede deshacer)', () => {
    const { cal } = calendario({ hoy: '2026-11-01', pagos: [pago('p', 5000, '2026-10-30')] })
    const marcado = { ...PLAN, month_status: conMarca(PLAN, 1, 'unpaid', '2026-11-01') }
    expect(cal(marcado).meses[0]).toMatchObject({ estado: 'por-pagar', origen: 'manual' })
  })

  it('un corte anterior al registro del plan lo decide la fecha', () => {
    const tarde = { ...PLAN, created_at: '2026-10-20T18:00:00Z' }
    const { mapa, cal } = calendario({ hoy: '2026-11-06', planes: [{ inst: tarde, cargo: { ...CARGO, date: '2026-10-20' } }] })
    expect(mapa.size).toBe(0)
    expect(cal(tarde).meses[0]).toMatchObject({ estado: 'pagada', porPagos: false })
  })

  it('una tarjeta dada de alta después del corte (estado aproximado) no opina', () => {
    const { mapa } = calendario({ hoy: '2026-11-06', tarjeta: { created_at: '2026-10-20T18:00:00Z' } })
    expect(mapa.has('p1:1')).toBe(false)
  })

  it('dos planes en el mismo corte: el pago cubre primero al más viejo', () => {
    const otro: Installment = { ...PLAN, id: 'p2', name: 'Bici', total_amount: 3000, monthly_amount: 500, start_date: '2026-09-25', created_at: '2026-09-25T18:00:00Z' }
    const { cal } = calendario({
      hoy: '2026-11-06',
      // 1,500 + 6,000 + 3,000 + 2,500, menos el pago de 1,200.
      tarjeta: { balance: 11800 },
      planes: [
        { inst: otro, cargo: { ...CARGO, id: 'msi2', amount: 3000, date: '2026-09-25' } },
        { inst: PLAN, cargo: CARGO },
      ],
      pagos: [pago('p', 1200, '2026-11-03')],
    })
    expect(cal(PLAN).meses[0].estado).toBe('pagada')
    expect(cal(otro).meses[0].estado).toBe('vencida')
  })

  it('liquidar marca también las que tus pagos no alcanzaron', () => {
    const { mapa, tarjeta } = calendario({ hoy: '2026-11-06' })
    const marcas = liquidarMarcas(PLAN, tarjeta, '2026-11-06', coberturaDe(mapa, 'p1'))
    const efectivas = marcasEfectivas({ ...PLAN, month_status: marcas })
    expect(Object.keys(efectivas)).toEqual(['1', '2', '3', '4', '5', '6'])
  })
})
