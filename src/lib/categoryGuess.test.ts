import { describe, expect, it } from 'vitest'
import { adivinarCategoria } from '@/lib/categoryGuess'

/**
 * La preselección de categoría.
 *
 * Importa porque elegir la categoría es lo que enlaza el gasto con la partida
 * del plan, y sin enlace el mismo dinero se resta dos veces del disponible: una
 * como porcentaje presupuestado y otra como cargo real. Dejarlo a que el
 * usuario se acuerde es dejarlo al azar.
 *
 * Y importa que no adivine de más: meter un gasto en una categoría que no le
 * toca libera del sobre dinero que sigue comprometido, y eso hace creer que hay
 * más disponible del que hay.
 */
const CATEGORIAS = [
  { id: 'c1', name: 'Renta' },
  { id: 'c2', name: 'Servicios' },
  { id: 'c3', name: 'Comida' },
  { id: 'c4', name: 'Transporte' },
  { id: 'c5', name: 'Salud' },
  { id: 'c6', name: 'Otros' },
]

describe('adivinarCategoria', () => {
  it('reconoce cómo se escribe de verdad cada gasto', () => {
    const casos: [string, string][] = [
      ['Renta', 'c1'],
      ['renta depa', 'c1'],
      ['Alquiler', 'c1'],
      ['CFE', 'c2'],
      ['Luz', 'c2'],
      ['Internet Totalplay', 'c2'],
      ['Agua', 'c2'],
      ['Despensa', 'c3'],
      ['Súper quincenal', 'c3'],
      ['Gasolina', 'c4'],
      ['Colegiatura', 'c5'],
      ['Gimnasio', 'c5'],
      // Los que se comían entre sí por coincidir dentro de otra palabra.
      ['Gasolina', 'c4'],
      ['Gas LP', 'c2'],
      ['Mantenimiento depa', 'c1'],
      ['Predial', 'c2'],
    ]
    for (const [nombre, esperado] of casos) {
      expect(adivinarCategoria(nombre, CATEGORIAS), nombre).toBe(esperado)
    }
  })

  it('no inventa una categoría cuando no reconoce el gasto', () => {
    // Preferible dejarlo vacío: el aviso del formulario le dice al usuario qué
    // pasa si lo deja así, y ese gasto se resta entero, que es lo prudente.
    for (const raro of ['Tanda', 'Cuota vecinos', 'xyz', '   ', '']) {
      expect(adivinarCategoria(raro, CATEGORIAS)).toBeNull()
    }
  })

  it('no devuelve una categoría que el usuario no tiene', () => {
    expect(adivinarCategoria('Renta', [{ id: 'c9', name: 'Otros' }])).toBeNull()
  })

  it('le da igual el acento y la mayúscula', () => {
    expect(adivinarCategoria('SUPER', CATEGORIAS)).toBe('c3')
    expect(adivinarCategoria('súper', CATEGORIAS)).toBe('c3')
  })
})
