import { describe, expect, it } from 'vitest'
import { decidirModoBarra } from './barraEstado'

describe('decidirModoBarra', () => {
  it('en Safari (no instalada) no aplica', () => {
    expect(decidirModoBarra({ instalada: false, vertical: true, insetArriba: 59 })).toBe('navegador')
  })

  it('instalada con la barra vieja: la página corre debajo de la barra', () => {
    expect(decidirModoBarra({ instalada: true, vertical: true, insetArriba: 59 })).toBe('translucida')
  })

  it('instalada con la barra estándar: el área segura de arriba mide 0', () => {
    expect(decidirModoBarra({ instalada: true, vertical: true, insetArriba: 0 })).toBe('estandar')
  })

  it('en horizontal no se puede saber y no se avisa', () => {
    expect(decidirModoBarra({ instalada: true, vertical: false, insetArriba: 0 })).toBe('estandar')
  })
})
