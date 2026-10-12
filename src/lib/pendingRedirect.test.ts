// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  destinoPendiente,
  guardarGrupoPendiente,
  guardarInvitacionPendiente,
  olvidarGrupoPendiente,
} from './pendingRedirect'

afterEach(() => localStorage.clear())

describe('destinoPendiente', () => {
  it('sin nada guardado, no hay destino', () => {
    expect(destinoPendiente()).toBeNull()
  })

  it('lleva a la invitación de grupo guardada', () => {
    guardarGrupoPendiente('abc-123', 1_000)
    expect(destinoPendiente(2_000)).toBe('/join/abc-123')
  })

  it('acepta el formato viejo (el código tal cual)', () => {
    localStorage.setItem('fortnight_pending_join', 'viejo')
    expect(destinoPendiente()).toBe('/join/viejo')
  })

  it('el grupo gana sobre la invitación a la app', () => {
    guardarInvitacionPendiente('tok', 1_000)
    guardarGrupoPendiente('grp', 1_000)
    expect(destinoPendiente(2_000)).toBe('/join/grp')
    olvidarGrupoPendiente()
    expect(destinoPendiente(2_000)).toBe('/invite/tok')
  })

  it('un enlace de hace más de un día ya no redirige', () => {
    guardarGrupoPendiente('grp', 0)
    expect(destinoPendiente(25 * 60 * 60 * 1000)).toBeNull()
    expect(localStorage.getItem('fortnight_pending_join')).toBeNull()
  })

  it('no lo borra al leerlo: lo borra la pantalla que lo procesa', () => {
    guardarGrupoPendiente('grp', 1_000)
    destinoPendiente(2_000)
    expect(destinoPendiente(3_000)).toBe('/join/grp')
  })
})
