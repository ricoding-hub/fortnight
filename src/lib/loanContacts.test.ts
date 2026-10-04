import { describe, expect, it } from 'vitest'
import { grupoDirectoPorContacto, grupoParaPrestamo, nombresDeConexiones, nombresDeContactos, unirNombres } from '@/lib/loanContacts'
import type { SplitMember } from '@/types'

const miembro = (id: string, name: string, over: Partial<SplitMember> = {}): SplitMember => ({
  id, group_id: 'g', user_id: 'u-yo', name, is_me: false, member_user_id: null, left_at: null, created_at: '', ...over,
})
const YO = miembro('m-yo', 'Richy', { is_me: true, member_user_id: 'u-yo' })

const directo = (id: string, contacto: string, conectado: boolean) => ({
  group: { id },
  isConnected: conectado,
  activeMembers: [YO, miembro(`m-${id}`, contacto)],
})
const trio = { group: { id: 'g-trio' }, isConnected: false, activeMembers: [YO, miembro('a', 'A'), miembro('b', 'B')] }

describe('nombresDeContactos', () => {
  it('sin repetir, sin vacíos y en orden', () => {
    expect(nombresDeContactos([{ name: 'Beto' }, { name: ' ale ' }, { name: 'Beto' }, { name: '' }])).toEqual(['ale', 'Beto'])
  })
})

describe('grupoDirectoPorContacto', () => {
  it('sólo cuenta conexiones de dos personas, por nombre en minúsculas', () => {
    const mapa = grupoDirectoPorContacto([directo('g1', 'Alesita', false), trio], 'u-yo')
    expect([...mapa.keys()]).toEqual(['alesita'])
  })
})

describe('grupoParaPrestamo', () => {
  const mapa = grupoDirectoPorContacto([directo('g1', 'Alesita', false), directo('g2', 'Beto', true)], 'u-yo')

  it('estampa el préstamo en la conexión sin conectar', () => {
    expect(grupoParaPrestamo('Alesita', mapa)).toBe('g1')
    expect(grupoParaPrestamo('  ALESITA ', mapa)).toBe('g1')
  })

  it('en una conexión conectada el préstamo queda privado', () => {
    // Estamparlo ahí lo metería en el saldo compartido sin que el otro lo sepa.
    expect(grupoParaPrestamo('Beto', mapa)).toBeNull()
  })

  it('con alguien sin conexión, ningún grupo', () => {
    expect(grupoParaPrestamo('Nadie', mapa)).toBeNull()
  })
})

describe('nombresDeConexiones y unirNombres', () => {
  it('lista a quien tienes conexión aunque no haya préstamos', () => {
    expect(nombresDeConexiones([directo('g1', 'Alesita', false), trio], 'u-yo')).toEqual(['Alesita'])
  })

  it('une sin repetir aunque cambie la mayúscula', () => {
    // "Ale" y "ale" son la misma persona: dos opciones en la lista confundirían.
    expect(unirNombres(['Beto', 'ale'], ['Ale', 'Carlos'])).toEqual(['ale', 'Beto', 'Carlos'])
  })
})
