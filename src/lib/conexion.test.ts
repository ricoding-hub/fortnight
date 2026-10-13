import { describe, expect, it } from 'vitest'
import { clavesDeContacto, contactoDe, esConexion, nombreDeRelacion, nombreVisible } from './conexion'
import type { SplitMember } from '@/types'

const m = (id: string, name: string, extra: Partial<SplitMember> = {}) =>
  ({ id, name, is_me: false, member_user_id: null, left_at: null, ...extra }) as SplitMember

// Toño creó la conexión: su fila es «Yo» y el grupo se llama «Richy».
const TONO = m('m-t', 'Yo', { is_me: true, member_user_id: 'u-tono' })
const RICHY = m('m-r', 'Richy', { member_user_id: 'u-richy' })
const conexion = { group: { name: 'Richy' }, activeMembers: [TONO, RICHY] }

describe('conexiones 1:1', () => {
  it('dos personas son una conexión; tres, un grupo', () => {
    expect(esConexion(conexion)).toBe(true)
    expect(esConexion({ activeMembers: [TONO, RICHY, m('m-x', 'Ana')] })).toBe(false)
  })

  it('para Richy, la otra persona es Toño, no él mismo', () => {
    expect(contactoDe(conexion, 'u-richy')?.id).toBe('m-t')
    expect(contactoDe(conexion, 'u-tono')?.id).toBe('m-r')
  })

  it('la relación se llama como la otra persona, nunca como el grupo', () => {
    const nombre = (x: SplitMember) => (x.id === 'm-t' ? 'Toño Trenado' : 'Richy')
    expect(nombreDeRelacion(conexion, 'u-richy', nombre)).toBe('Toño Trenado')
    expect(nombreDeRelacion(conexion, 'u-tono', nombre)).toBe('Richy')
  })
})

describe('nombreVisible', () => {
  it('gana el nombre del perfil', () => {
    expect(nombreVisible(TONO, { display_name: 'Toño Trenado', email: 't@x.mx' }, 'u-richy')).toBe('Toño Trenado')
  })

  it('nunca muestra «Yo» de otra persona: cae al correo', () => {
    expect(nombreVisible(TONO, { display_name: null, email: 'tono@x.mx' }, 'u-richy')).toBe('tono')
    expect(nombreVisible(TONO, undefined, 'u-richy')).toBe('Tu contacto')
  })

  it('a ti mismo sí te muestra tu etiqueta', () => {
    expect(nombreVisible(TONO, undefined, 'u-tono')).toBe('Yo')
  })
})

describe('clavesDeContacto', () => {
  it('ignora la etiqueta «Yo» y usa el nombre visible', () => {
    expect(clavesDeContacto(TONO, 'Toño Trenado')).toEqual(['toño trenado'])
    expect(clavesDeContacto(m('x', 'Ale'), 'Alesita Palomino')).toEqual(['ale', 'alesita palomino'])
  })
})
