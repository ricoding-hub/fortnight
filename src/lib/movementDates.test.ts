import { describe, expect, it } from 'vitest'
import { diaLocal, etiquetaDia, fechaCorta, registroDistinto, textoDeFecha } from '@/lib/movementDates'

/** Un timestamp ISO a partir de una hora LOCAL, sea cual sea la zona del equipo. */
const iso = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

describe('registroDistinto', () => {
  it('mismo día: no hay nada que avisar', () => {
    expect(registroDistinto('2026-09-29', iso(2026, 9, 29, 10))).toBeNull()
  })

  it('otro día: devuelve el día en que se registró', () => {
    expect(registroDistinto('2026-09-29', iso(2026, 10, 4, 9))).toBe('2026-10-04')
  })

  it('registrar de noche no cambia el día', () => {
    // 23:30 locales. En CDMX eso ya es el día siguiente en UTC; comparar el
    // timestamp tal cual movería el gasto de día y avisaría "registrado el 1"
    // de algo que se anotó el mismo 30.
    expect(registroDistinto('2026-09-30', iso(2026, 9, 30, 23, 30))).toBeNull()
  })

  it('acepta un gasto fechado hacia atrás', () => {
    expect(registroDistinto('2026-07-20', iso(2026, 9, 24, 8))).toBe('2026-09-24')
  })
})

describe('diaLocal', () => {
  it('deja intacta una fecha YYYY-MM-DD', () => {
    expect(diaLocal('2026-09-29')).toBe('2026-09-29')
  })
  it('lee un timestamp con la hora local', () => {
    expect(diaLocal(iso(2026, 9, 30, 23, 30))).toBe('2026-09-30')
  })
})

describe('etiquetaDia', () => {
  const hoy = new Date(2026, 9, 4, 0, 10) // 4 oct, 00:10

  it('hoy y ayer, por día y no por 24 horas', () => {
    expect(etiquetaDia('2026-10-04', hoy)).toBe('Hoy')
    // A las 00:10, "ayer" son 10 minutos atrás.
    expect(etiquetaDia('2026-10-03', hoy)).toBe('Ayer')
  })

  it('el resto, con día de la semana', () => {
    expect(etiquetaDia('2026-09-29', hoy)).toBe('Mar 29 sep')
  })

  it('con año cuando no es de este año', () => {
    expect(etiquetaDia('2025-12-31', hoy)).toBe('Mié 31 dic 2025')
  })
})

describe('fechaCorta', () => {
  it('sin año si es de este año', () => {
    expect(fechaCorta('2026-10-04', new Date(2026, 9, 10))).toBe('4 oct')
    expect(fechaCorta('2025-10-04', new Date(2026, 9, 10))).toBe('4 oct 2025')
  })
})

describe('textoDeFecha', () => {
  it('cubre las formas en que alguien la escribiría', () => {
    const t = textoDeFecha('2026-09-23')
    for (const forma of ['23 sep', '23 septiembre', '23/09', '2026-09-23', 'mié']) {
      expect(t).toContain(forma)
    }
  })
})
