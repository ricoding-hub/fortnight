import { describe, expect, it } from 'vitest'
import { subMonthlyAmount } from '@/lib/projections'

describe('subMonthlyAmount con lo que de verdad devuelve Postgres', () => {
  it('no concatena cuando el monto llega como cadena', () => {
    // `numeric` viaja como cadena por PostgREST. En el caso mensual esto
    // devolvía el valor tal cual, así que quien sumaba concatenaba: 299 y 199
    // daban "0299199". Anual y trimestral se salvaban por la división, o sea
    // que fallaba justo el caso común.
    const suma = ['299', '199'].reduce(
      (n, a) => n + subMonthlyAmount(a as unknown as number, 'mensual'),
      0,
    )
    expect(suma).toBe(498)
  })

  it('divide igual venga número o cadena', () => {
    expect(subMonthlyAmount('1200' as unknown as number, 'anual')).toBe(100)
    expect(subMonthlyAmount(1200, 'anual')).toBe(100)
    expect(subMonthlyAmount('900' as unknown as number, 'trimestral')).toBe(300)
  })

  it('un monto imposible vale cero, no NaN', () => {
    // Un NaN suelto envenena toda la suma y deja la pantalla en "$NaN".
    for (const raro of [null, undefined, '', 'abc', {}]) {
      expect(subMonthlyAmount(raro as unknown as number, 'mensual')).toBe(0)
    }
  })
})
