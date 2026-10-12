import { describe, expect, it } from 'vitest'
import { enumerarNombres } from './format'

describe('enumerarNombres', () => {
  it('une una, dos y más personas como se dice en español', () => {
    expect(enumerarNombres([])).toBe('')
    expect(enumerarNombres(['Ana'])).toBe('Ana')
    expect(enumerarNombres(['Ana', 'Luis'])).toBe('Ana y Luis')
    expect(enumerarNombres(['Ana', 'Luis', 'Pepe'])).toBe('Ana, Luis y 1 más')
    expect(enumerarNombres(['Ana', 'Luis', 'Pepe'], 3)).toBe('Ana, Luis y Pepe')
  })

  it('ignora nombres vacíos', () => {
    expect(enumerarNombres([' ', 'Ana', ''])).toBe('Ana')
  })
})
