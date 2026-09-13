import { describe, expect, it } from 'vitest'
import { conCategoriaPorDefecto, enlaceDelCargo, enlacesPorCategoria, liberadoPorSobre } from '@/lib/recurringLink'
import type { BucketWithItems, Subscription } from '@/types'

/** El plan por omisión, recortado a lo que importa aquí. */
const SOBRES: BucketWithItems[] = [
  {
    id: 'b1', plan_id: 'p', slug: 'needs', name: 'Necesidades', pct: 50,
    color: '#2A4BFF', soft_color: '#E6EAFF', sort_order: 0,
    items: [
      { id: 'i-renta', bucket_id: 'b1', slug: 'rent', name: 'Renta', pct: 25, category_id: 'c-renta', icon: 'rent', sort_order: 0 },
      { id: 'i-desp', bucket_id: 'b1', slug: 'food', name: 'Despensa', pct: 13, category_id: 'c-comida', icon: 'food', sort_order: 1 },
      { id: 'i-serv', bucket_id: 'b1', slug: 'util', name: 'Servicios', pct: 7, category_id: 'c-serv', icon: 'bolt', sort_order: 2 },
    ],
  },
  {
    id: 'b2', plan_id: 'p', slug: 'wants', name: 'Estilo de vida', pct: 30,
    color: '#FFB59E', soft_color: '#FFE7DD', sort_order: 1,
    items: [
      { id: 'i-fuera', bucket_id: 'b2', slug: 'out', name: 'Comida fuera', pct: 8, category_id: 'c-comida', icon: 'food', sort_order: 0 },
      { id: 'i-subs', bucket_id: 'b2', slug: 'sub', name: 'Suscripciones', pct: 3, category_id: 'c-subs', icon: 'sparkles', sort_order: 1 },
    ],
  },
]

function cargo(over: Partial<Subscription>): Subscription {
  return {
    id: 'x', user_id: 'u', account_id: null, kind: 'fijo', name: 'Cargo',
    amount: 1000, frequency: 'mensual', charge_day: 1, category_id: null,
    brand_id: null, color: null, notes: null, active: true,
    created_at: '', updated_at: '', ...over,
  } as Subscription
}

const RENTA = cargo({ id: 'r', name: 'Renta', amount: 9500, category_id: 'c-renta' })
const NETFLIX = cargo({ id: 'n', kind: 'suscripcion', name: 'Netflix', amount: 299, category_id: 'c-subs' })

describe('enlacesPorCategoria', () => {
  it('la renta alimenta la partida Renta, no otra', () => {
    const e = enlacesPorCategoria(SOBRES, [RENTA])
    expect(e.get('c-renta')).toMatchObject({
      itemId: 'i-renta', itemName: 'Renta', bucketSlug: 'needs', mensual: 9500,
    })
  })

  it('la renta NO se cuela en la partida de Suscripciones', () => {
    // Este es el fallo que metí en v1.9.0: Presupuesto tomaba el total de TODOS
    // los cargos recurrentes para la partida "Suscripciones", y desde que los
    // gastos fijos comparten tabla, ahí dentro aparecía la renta.
    const e = enlacesPorCategoria(SOBRES, [RENTA, NETFLIX])
    expect(e.get('c-subs')?.mensual).toBe(299)
    expect(e.get('c-subs')?.cargos.map((c) => c.name)).toEqual(['Netflix'])
  })

  it('los servicios funcionan igual en cuanto se dan de alta, sin tocar nada', () => {
    const luz = cargo({ id: 'l', name: 'CFE', amount: 850, category_id: 'c-serv' })
    const e = enlacesPorCategoria(SOBRES, [RENTA, luz])
    expect(e.get('c-serv')).toMatchObject({ itemName: 'Servicios', mensual: 850 })
  })

  it('una categoría en dos sobres acredita sólo el primero', () => {
    // "Comida" está en Despensa (necesidades) y en Comida fuera (gustos).
    const desp = cargo({ id: 'd', name: 'Despensa', amount: 2000, category_id: 'c-comida' })
    const e = enlacesPorCategoria(SOBRES, [desp])
    expect(e.get('c-comida')?.itemId).toBe('i-desp')
    expect(e.size).toBe(1)
  })

  it('suma los cargos que comparten categoría', () => {
    const otro = cargo({ id: 'r2', name: 'Bodega', amount: 500, category_id: 'c-renta' })
    expect(enlacesPorCategoria(SOBRES, [RENTA, otro]).get('c-renta')?.mensual).toBe(10_000)
  })

  it('ignora los cargos pausados y los que no tienen categoría', () => {
    const pausado = cargo({ id: 'p', name: 'Renta vieja', amount: 8000, category_id: 'c-renta', active: false })
    const sinCat = cargo({ id: 's', name: 'Tanda', amount: 700 })
    const e = enlacesPorCategoria(SOBRES, [pausado, sinCat])
    expect(e.size).toBe(0)
  })
})

describe('liberadoPorSobre', () => {
  it('libera sólo la partida acreditada, con su porcentaje', () => {
    const e = enlacesPorCategoria(SOBRES, [RENTA])
    const l = liberadoPorSobre(SOBRES, e, 10_000)
    expect(l.get('needs')).toBe(2500) // Renta 25 % de 10,000
    expect(l.get('wants')).toBe(0)
  })

  it('una categoría en dos sobres no libera los dos', () => {
    const desp = cargo({ id: 'd', name: 'Despensa', amount: 2000, category_id: 'c-comida' })
    const l = liberadoPorSobre(SOBRES, enlacesPorCategoria(SOBRES, [desp]), 10_000)
    expect(l.get('needs')).toBe(1300) // Despensa 13 %
    expect(l.get('wants')).toBe(0)    // Comida fuera 8 % intacto
  })
})

describe('enlaceDelCargo', () => {
  it('dice en qué partida del plan cae un cargo', () => {
    const e = enlacesPorCategoria(SOBRES, [RENTA])
    expect(enlaceDelCargo(RENTA, e)).toMatchObject({ itemName: 'Renta', bucketName: 'Necesidades' })
  })

  it('null cuando el plan no presupuesta esa categoría', () => {
    expect(enlaceDelCargo(cargo({ category_id: 'c-nada' }), enlacesPorCategoria(SOBRES, []))).toBeNull()
    expect(enlaceDelCargo(cargo({}), enlacesPorCategoria(SOBRES, []))).toBeNull()
  })
})

describe('conCategoriaPorDefecto', () => {
  const CATS = [
    { id: 'c-subs', user_id: 'u', name: 'Suscripciones', kind: 'fixed', icon: null, color: null },
    { id: 'c-renta', user_id: 'u', name: 'Renta', kind: 'fixed', icon: null, color: null },
  ] as never

  it('una suscripción sin categoría cae en Suscripciones', () => {
    // El formulario de suscripciones no pregunta categoría — a Netflix no se le
    // elige una — y sin ella su importe se restaría dos veces: en el sobre del
    // plan y como cargo real.
    const sinCat = cargo({ id: 'n', kind: 'suscripcion', name: 'Netflix', amount: 299 })
    const [r] = conCategoriaPorDefecto([sinCat], CATS)
    expect(r.category_id).toBe('c-subs')
  })

  it('y entonces sí acredita su partida', () => {
    const sinCat = cargo({ id: 'n', kind: 'suscripcion', name: 'Netflix', amount: 299 })
    const e = enlacesPorCategoria(SOBRES, conCategoriaPorDefecto([sinCat], CATS))
    expect(e.get('c-subs')).toMatchObject({ itemName: 'Suscripciones', mensual: 299 })
  })

  it('a un gasto fijo NO se le inventa categoría', () => {
    // La renta sin categoría es una decisión del usuario, no un hueco: se resta
    // entera porque el plan no la contemplaba. Meterla en Suscripciones sería
    // liberar presupuesto que no le corresponde.
    const renta = cargo({ id: 'r', kind: 'fijo', name: 'Renta', amount: 9500 })
    expect(conCategoriaPorDefecto([renta], CATS)[0].category_id).toBeNull()
  })

  it('no pisa una categoría ya elegida', () => {
    const conCat = cargo({ id: 'x', kind: 'suscripcion', category_id: 'c-renta' })
    expect(conCategoriaPorDefecto([conCat], CATS)[0].category_id).toBe('c-renta')
  })

  it('sin categoría Suscripciones en la cuenta, no rompe', () => {
    const sinCat = cargo({ id: 'n', kind: 'suscripcion', amount: 299 })
    expect(conCategoriaPorDefecto([sinCat], [] as never)[0].category_id).toBeNull()
  })
})
