import { describe, expect, it } from 'vitest'
import { guessCategory, normalize } from '@/lib/categoryMatch'
import type { Category } from '@/types'

/** Minimal Category factory with the default seeded names. */
function cat(name: string, kind: Category['kind'] = 'variable'): Category {
  return { id: name.toLowerCase(), user_id: 'u', name, kind, icon: null, color: null, created_at: '' }
}

const CATEGORIES: Category[] = [
  cat('Renta', 'fixed'),
  cat('Servicios', 'fixed'),
  cat('Suscripciones', 'fixed'),
  cat('Comida'),
  cat('Social'),
  cat('Transporte'),
  cat('Salud'),
  cat('Otros'),
  cat('Salario', 'income'),
]

describe('normalize', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalize('Alitas y Michés!')).toBe('alitas y miches')
    expect(normalize('  Café   con   pan ')).toBe('cafe con pan')
  })
})

describe('guessCategory', () => {
  const g = (desc: string) => guessCategory(desc, CATEGORIES)?.name ?? null

  it('maps food words to Comida', () => {
    expect(g('alitas y miches')).toBe('Comida')
    expect(g('super de la semana')).toBe('Comida')
    expect(g('Tacos al pastor')).toBe('Comida')
  })

  it('maps transport words to Transporte', () => {
    expect(g('uber al aeropuerto')).toBe('Transporte')
    expect(g('estacionamiento plaza')).toBe('Transporte')
    expect(g('taxi')).toBe('Transporte')
  })

  it('maps drinks/outings to Social', () => {
    expect(g('cervezas en el bar')).toBe('Social')
    expect(g('boletos de cine')).toBe('Social')
    expect(g('entradas al concierto')).toBe('Social')
  })

  it('maps health words to Salud', () => {
    expect(g('farmacia guadalajara')).toBe('Salud')
    expect(g('consulta dentista')).toBe('Salud')
  })

  it('does not false-match substrings (gas vs gasto)', () => {
    // "gastos varios" should NOT map to Transporte via "gas"
    expect(g('gastos varios')).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(g('xyzzy')).toBeNull()
    expect(g('')).toBeNull()
  })

  it('only returns categories the user actually has', () => {
    // A user without a Transporte category can't get it suggested.
    const limited = [cat('Comida'), cat('Otros')]
    expect(guessCategory('uber al centro', limited)).toBeNull()
    expect(guessCategory('tacos', limited)?.name).toBe('Comida')
  })
})
