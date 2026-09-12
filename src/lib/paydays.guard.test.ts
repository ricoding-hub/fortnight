import { describe, expect, it } from 'vitest'
import { PAY_FREQS, payFreqOf } from '@/lib/paydays'

describe('payFreqOf', () => {
  it('deja pasar las frecuencias que existen', () => {
    for (const f of Object.keys(PAY_FREQS)) expect(payFreqOf(f)).toBe(f)
  })

  it('cae a catorcenal ante cualquier otra cosa', () => {
    // `pay_freq` es una columna de texto: puede traer una frecuencia añadida
    // después y vista por un cliente viejo, una fila migrada a mano o un nulo.
    // Media app hacía `as PayFreq` y luego `PAY_FREQS[freq].cyclesPerMonth`,
    // que con un valor desconocido es un TypeError al dibujar — una pantalla en
    // blanco por un dato, no por un error de lógica.
    for (const raro of ['decenal', 'QUINCENAL', '', null, undefined, 42, {}, []]) {
      expect(payFreqOf(raro)).toBe('catorcenal')
    }
  })

  it('lo que devuelve siempre existe en PAY_FREQS', () => {
    for (const raro of ['decenal', null, 'semanal']) {
      expect(PAY_FREQS[payFreqOf(raro)]).toBeDefined()
      expect(PAY_FREQS[payFreqOf(raro)].cyclesPerMonth).toBeGreaterThan(0)
    }
  })
})
