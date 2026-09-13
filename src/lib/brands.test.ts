import { describe, expect, it } from 'vitest'
import { BRANDS, findBrand } from '@/lib/brands'

/**
 * La búsqueda de marca decide si un cargo enseña su logo o un cuadro gris con
 * iniciales. En la lista de recurrentes, Telcel y Claude Pro salían en gris
 * mientras Spotify salía en verde, y la única diferencia era si alguien había
 * tocado el selector de marca al darlos de alta.
 */
describe('findBrand', () => {
  it('encuentra las marcas tal como las escribe la gente', () => {
    const casos: [string, string][] = [
      ['Spotify', 'spotify'],
      ['iCloud', 'icloud'],
      ['Telcel', 'telcel'],
      ['Claude Pro', 'claude'],        // comparaba al revés: no lo encontraba
      ['HBO Max', 'hbo'],              // la marca se llama "HBO Max", no "hbo"
      ['ChatGPT Plus', 'chatgpt'],
      ['Netflix familiar', 'netflix'],
      ['Prime Video', 'prime'],
      ['Apple Music', 'applemusic'],
      ['Disney plus', 'disney'],
      ['YouTube Premium', 'youtube'],
      ['Xbox Game Pass', 'xbox'],
      ['Smart Fit', 'smartfit'],
      ['plan telcel max', 'telcel'],
    ]
    for (const [escrito, esperado] of casos) {
      expect(findBrand(escrito)?.id, escrito).toBe(esperado)
    }
  })

  it('gana la coincidencia más larga', () => {
    // "Apple Music" contiene "apple", que es alias de iCloud. Sin preferir la
    // coincidencia más larga, la música de Apple saldría con el logo de iCloud.
    expect(findBrand('Apple Music')?.id).toBe('applemusic')
    expect(findBrand('Apple TV+')?.id).toBe('appletv')
  })

  it('no casa dentro de otra palabra', () => {
    // "max" está en HBO Max; sin frontera de palabra se llevaría cualquier cosa
    // que lo contenga, y un logo equivocado es peor que ninguno.
    expect(findBrand('Climax gym')?.id).not.toBe('hbo')
    expect(findBrand('Uberto')?.id).not.toBe('uberone')
  })

  it('le da igual el acento y la mayúscula', () => {
    expect(findBrand('TELCEL')?.id).toBe('telcel')
    expect(findBrand('telcél')?.id).toBe('telcel')
  })

  it('no inventa marca para lo que no la tiene', () => {
    // La renta de un particular no es una marca. Un cuadro con iniciales es la
    // respuesta correcta, no un logo cualquiera que se le parezca.
    for (const n of ['Renta Parras', 'Tanda del trabajo', 'Cuota vecinos', '', '   ']) {
      expect(findBrand(n), n).toBeUndefined()
    }
    expect(findBrand(null)).toBeUndefined()
    expect(findBrand(undefined)).toBeUndefined()
  })

  it('sigue encontrando por id, que es como se guardan', () => {
    expect(findBrand('claude')?.name).toBe('Claude')
    expect(findBrand('hbo')?.name).toBe('HBO Max')
  })
})

describe('el catálogo', () => {
  it('no repite ids', () => {
    const ids = BRANDS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada marca se encuentra a sí misma por su nombre', () => {
    // Si una marca no se encuentra con su propio nombre, nadie la va a
    // encontrar escribiéndolo.
    for (const b of BRANDS) {
      expect(findBrand(b.name)?.id, b.name).toBe(b.id)
    }
  })

  it('las suscripciones que la gente paga tienen dominio', () => {
    // Sin dominio no hay logo que cargar: es el cuadro gris del reporte.
    const conocidas = ['netflix', 'spotify', 'claude', 'chatgpt', 'icloud', 'prime', 'hbo', 'telcel', 'disney', 'youtube']
    for (const id of conocidas) {
      const b = BRANDS.find((x) => x.id === id)
      expect(b, id).toBeTruthy()
      expect(b!.domain, id).toBeTruthy()
    }
  })
})
