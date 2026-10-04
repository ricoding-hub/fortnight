import { describe, expect, it } from 'vitest'
import { coincide, construirTexto, normalizar, textoDeMonto } from '@/lib/movementSearch'

const fila = (...p: Parameters<typeof construirTexto>) => construirTexto(...p)

describe('normalizar', () => {
  it('sin acentos, sin mayúsculas', () => {
    expect(normalizar('  Depósito  de la MOTO ')).toBe('deposito de la moto')
  })
})

describe('coincide', () => {
  const wings = fila(['Wings Army 23 sep', 'Richy', 'Comida'], [540])

  it('una consulta vacía deja pasar todo', () => {
    expect(coincide(wings, '')).toBe(true)
    expect(coincide(wings, '   ')).toBe(true)
  })

  it('no distingue acentos ni mayúsculas', () => {
    expect(coincide(fila(['Depósito de la moto']), 'DEPOSITO')).toBe(true)
    expect(coincide(fila(['Deposito de la moto']), 'depósito')).toBe(true)
  })

  it('varias palabras: todas, en cualquier orden', () => {
    expect(coincide(wings, 'wings army')).toBe(true)
    expect(coincide(wings, 'army wings')).toBe(true)
    expect(coincide(wings, 'wings taco')).toBe(false)
  })

  it('encuentra por quién pagó o por categoría', () => {
    expect(coincide(wings, 'richy')).toBe(true)
    expect(coincide(wings, 'comida')).toBe(true)
  })

  it('un monto se encuentra con o sin símbolos', () => {
    const gasto = fila(['Cactus Beach club'], [1000])
    for (const q of ['1000', '1,000', '$1,000', '$1000', '1000.00']) {
      expect(coincide(gasto, q), q).toBe(true)
    }
    expect(coincide(gasto, '2000')).toBe(false)
  })

  it('un monto con centavos', () => {
    expect(coincide(fila(['La chilakleta'], [354.42]), '354.42')).toBe(true)
    expect(coincide(fila(['La chilakleta'], [354.42]), '$354.42')).toBe(true)
  })

  it('encuentra por fecha', () => {
    const f = fila(['Cena'], [], ['23 sep 23/09 2026-09-23 septiembre'])
    expect(coincide(f, '23 sep')).toBe(true)
    expect(coincide(f, 'septiembre')).toBe(true)
    expect(coincide(f, '24 sep')).toBe(false)
  })

  it('sin resultados cuando no hay nada', () => {
    expect(coincide(wings, 'zzz')).toBe(false)
  })

  it('compara por INICIO de palabra, no por subcadena', () => {
    // El fallo real: «gas» devolvía todo lo que pagaste tú, porque «gas» está
    // dentro de «pa-gas-te».
    const cena = fila(['Cena', 'Pagaste tu'])
    expect(coincide(cena, 'gas')).toBe(false)
    expect(coincide(fila(['Gasolina']), 'gas')).toBe(true)
    expect(coincide(fila(['Cambio de la gas']), 'gas')).toBe(true)
  })

  it('un monto coincide por su inicio: 270 encuentra 270.00 pero no 1270.00', () => {
    expect(coincide(fila(['Cena'], [270]), '270')).toBe(true)
    expect(coincide(fila(['Cena'], [1270]), '270')).toBe(false)
  })
})

describe('textoDeMonto', () => {
  it('las formas de escribir mil pesos', () => {
    const t = textoDeMonto(1000)
    for (const forma of ['1000', '1000.00', '1,000.00']) expect(t).toContain(forma)
  })
  it('ignora el signo', () => {
    expect(textoDeMonto(-85)).toContain('85.00')
  })
})
