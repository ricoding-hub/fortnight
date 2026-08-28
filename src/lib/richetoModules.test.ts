import { beforeEach, describe, expect, it } from 'vitest'
import {
  moduleKey,
  moduleMessage,
  readSeen,
  markSeen,
  seenStorageKey,
} from '@/lib/richetoModules'

describe('moduleKey', () => {
  it('maps each section to its own module', () => {
    expect(moduleKey('/')).toBe('home')
    expect(moduleKey('/plan')).toBe('plan')
    expect(moduleKey('/plan/proyeccion')).toBe('plan')
    expect(moduleKey('/cuentas')).toBe('cuentas')
    expect(moduleKey('/cuentas/mis')).toBe('cuentas')
    expect(moduleKey('/cuentas/movimientos')).toBe('movimientos')
    expect(moduleKey('/cuentas/prestamos')).toBe('prestamos')
    expect(moduleKey('/cuentas/prestamos/abc-123')).toBe('prestamos')
    expect(moduleKey('/perfil')).toBe('otros')
  })

  // Order matters: /cuentas/movimientos must not be swallowed by /cuentas.
  it('prefers the most specific section', () => {
    expect(moduleKey('/cuentas/movimientos')).not.toBe('cuentas')
    expect(moduleKey('/cuentas/prestamos')).not.toBe('cuentas')
  })

  it('gives every module a message', () => {
    for (const p of ['/', '/plan', '/cuentas', '/cuentas/movimientos', '/cuentas/prestamos', '/x']) {
      expect(moduleMessage(p).length).toBeGreaterThan(0)
    }
  })

  // Navigating deeper inside a section must not re-trigger the hint.
  it('keeps one key across a section so the same hint is not repeated', () => {
    expect(moduleKey('/cuentas/prestamos')).toBe(moduleKey('/cuentas/prestamos/xyz'))
  })
})

/** These tests run in Node, which has no localStorage — a minimal stand-in. */
function installLocalStorage() {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

describe('seen state', () => {
  beforeEach(() => {
    installLocalStorage()
  })

  it('starts empty and records what was seen', () => {
    expect(readSeen('u1').size).toBe(0)
    markSeen('u1', 'home')
    expect(readSeen('u1').has('home')).toBe(true)
    expect(readSeen('u1').has('plan')).toBe(false)
  })

  it('accumulates across modules', () => {
    markSeen('u1', 'home')
    markSeen('u1', 'plan')
    expect([...readSeen('u1')].sort()).toEqual(['home', 'plan'])
  })

  it('keeps users apart on a shared device', () => {
    markSeen('u1', 'home')
    expect(readSeen('u2').size).toBe(0)
    expect(seenStorageKey('u1')).not.toBe(seenStorageKey('u2'))
  })

  it('survives a corrupted stored value', () => {
    localStorage.setItem(seenStorageKey('u1'), 'no-es-json')
    expect(readSeen('u1').size).toBe(0)
  })
})
