import { vi } from 'vitest'

/**
 * Doble del cliente de Supabase para montar la app en pruebas.
 *
 * Existe porque nada de lo que corríamos ejecutaba un componente: `tsc`, los
 * tests unitarios y el build pasaron los tres y aun así v1.7.5 se quedó en
 * blanco al dibujar Inicio. Esto cierra ese hueco sin necesitar red ni cuenta.
 *
 * El constructor de consultas de postgrest-js es encadenable y además es un
 * thenable: `from(t).select().eq().order()` se puede esperar en cualquier punto
 * de la cadena. El doble reproduce eso con un Proxy: cualquier método devuelve
 * la propia cadena, y `then` resuelve con las filas de la tabla.
 */

export type Filas = Record<string, unknown[]>

interface Opciones {
  /** Filas por tabla. Lo que no esté aquí devuelve []. */
  tablas?: Filas
  /** Tablas que deben fallar, para probar el camino de error. */
  errores?: Record<string, { message: string; code?: string }>
  /** Usuario de la sesión fingida. null = sin sesión. */
  userId?: string | null
}

const SIN_ERROR = null

export function crearSupabaseDoble({ tablas = {}, errores = {}, userId = 'u-1' }: Opciones = {}) {
  const consultas: string[] = []

  function cadena(tabla: string): unknown {
    const resultado = () =>
      errores[tabla]
        ? { data: null, error: { ...errores[tabla], details: '', hint: '' } }
        : { data: tablas[tabla] ?? [], error: SIN_ERROR }

    const objetivo = {} as Record<string, unknown>
    const proxy: unknown = new Proxy(objetivo, {
      get(_t, prop) {
        if (prop === 'then') {
          // Awaitable en cualquier punto de la cadena, como postgrest-js.
          return (res: (v: unknown) => void) => Promise.resolve(resultado()).then(res)
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          const { data, error } = resultado()
          const fila = Array.isArray(data) ? (data[0] ?? null) : data
          return () => Promise.resolve({ data: fila, error })
        }
        if (typeof prop === 'symbol') return undefined
        // select/eq/order/limit/insert/update/delete/in/gte/… todos encadenan.
        return () => {
          consultas.push(`${tabla}.${String(prop)}`)
          return proxy
        }
      },
    })
    return proxy
  }

  const canal = {
    on: vi.fn(() => canal),
    subscribe: vi.fn(() => canal),
    unsubscribe: vi.fn(() => Promise.resolve('ok')),
  }

  const sesion = userId
    ? {
        access_token: 't',
        refresh_token: 'r',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: userId, email: 'prueba@fortnight.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
      }
    : null

  return {
    consultas,
    cliente: {
      from: vi.fn((tabla: string) => cadena(tabla)),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: SIN_ERROR })),
      channel: vi.fn(() => canal),
      removeChannel: vi.fn(() => Promise.resolve('ok')),
      storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) })) },
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: sesion }, error: SIN_ERROR })),
        getUser: vi.fn(() => Promise.resolve({ data: { user: sesion?.user ?? null }, error: SIN_ERROR })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        signOut: vi.fn(() => Promise.resolve({ error: SIN_ERROR })),
        signInWithPassword: vi.fn(() => Promise.resolve({ data: { session: sesion }, error: SIN_ERROR })),
        signInWithOtp: vi.fn(() => Promise.resolve({ error: SIN_ERROR })),
        signInWithOAuth: vi.fn(() => Promise.resolve({ error: SIN_ERROR })),
        resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: SIN_ERROR })),
        updateUser: vi.fn(() => Promise.resolve({ error: SIN_ERROR })),
      },
    },
  }
}
