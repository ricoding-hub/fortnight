import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureCacheOwner, hadSession, purgeDataCache, rememberHadSession } from '@/lib/dataCache'

/** Node has neither localStorage nor CacheStorage — minimal stand-ins. */
const deleted: string[] = []
function install() {
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
  deleted.length = 0
  ;(globalThis as { caches?: unknown }).caches = {
    delete: vi.fn(async (name: string) => {
      deleted.push(name)
      return true
    }),
  }
}

describe('data cache ownership', () => {
  beforeEach(install)

  it('claims the cache for the first user without purging', async () => {
    await ensureCacheOwner('user-a')
    expect(deleted).toEqual([])
  })

  it('keeps the cache while the same user stays signed in', async () => {
    await ensureCacheOwner('user-a')
    await ensureCacheOwner('user-a')
    expect(deleted).toEqual([])
  })

  // The whole point: reads are cached by URL, so a second account on the same
  // browser would otherwise read the first account's balances offline.
  it('purges when a different user signs in', async () => {
    await ensureCacheOwner('user-a')
    await ensureCacheOwner('user-b')
    expect(deleted).toEqual(['supabase-data-cache', 'logos-cache', 'avatars-cache'])
  })

  it('ignores a signed-out state instead of clearing the owner', async () => {
    await ensureCacheOwner('user-a')
    await ensureCacheOwner(undefined)
    expect(deleted).toEqual([])
  })

  it('purging drops the cache and forgets the owner', async () => {
    await ensureCacheOwner('user-a')
    await purgeDataCache()
    expect(deleted).toEqual(['supabase-data-cache', 'logos-cache', 'avatars-cache'])
    // Owner forgotten, so the next sign-in claims it fresh without purging.
    await ensureCacheOwner('user-b')
    expect(deleted).toEqual(['supabase-data-cache', 'logos-cache', 'avatars-cache'])
  })
})

describe('had-session marker', () => {
  beforeEach(install)

  it('starts false and records a session', () => {
    expect(hadSession()).toBe(false)
    rememberHadSession(true)
    expect(hadSession()).toBe(true)
  })

  it('clears on sign out', () => {
    rememberHadSession(true)
    rememberHadSession(false)
    expect(hadSession()).toBe(false)
  })
})

describe('cerrar sesión también borra las imágenes de esa cuenta', () => {
  beforeEach(install)

  it('el perfil guardado y los logos fallidos se van; lo demás se queda', async () => {
    localStorage.setItem('fortnight:perfil:user-a', '{"id":"user-a"}')
    localStorage.setItem('fortnight:logos-sin-marca', '["nu.com.mx"]')
    localStorage.setItem('fortnight_tour_seen', '1')
    await purgeDataCache()
    expect(deleted).toEqual(['supabase-data-cache', 'logos-cache', 'avatars-cache'])
    expect(localStorage.getItem('fortnight:perfil:user-a')).toBeNull()
    expect(localStorage.getItem('fortnight:logos-sin-marca')).toBeNull()
    expect(localStorage.getItem('fortnight_tour_seen')).toBe('1')
  })
})
