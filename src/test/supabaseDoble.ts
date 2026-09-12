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

interface CanalDoble {
  topic: string
  on: (evento: string, ...resto: unknown[]) => CanalDoble
  subscribe: () => CanalDoble
  unsubscribe: () => Promise<string>
}

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

  /**
   * Canales con el mismo comportamiento que el cliente real, que es donde este
   * doble mentía y por eso dejó pasar la caída de Inicio dos veces:
   *
   * - `channel(nombre)` devuelve el canal YA REGISTRADO si ese nombre existe
   *   (`RealtimeClient.channel` hace exactamente esto);
   * - y `.on()` lanza si el canal ya está suscrito, con el mismo mensaje.
   *
   * Un doble más permisivo que el original no prueba nada: deja pasar justo los
   * fallos que sólo aparecen cuando dos componentes hacen lo mismo a la vez.
   */
  const registro = new Map<string, CanalDoble>()

  function crearCanal(nombre: string): CanalDoble {
    const existente = registro.get(nombre)
    if (existente) return existente

    let suscrito = false
    const canal: CanalDoble = {
      topic: nombre,
      on: (evento: string) => {
        if (suscrito && (evento === 'postgres_changes' || evento === 'presence')) {
          throw new Error(
            `cannot add \`${evento}\` callbacks for ${nombre} after \`subscribe()\`.`,
          )
        }
        return canal
      },
      subscribe: () => {
        suscrito = true
        return canal
      },
      unsubscribe: () => {
        suscrito = false
        registro.delete(nombre)
        return Promise.resolve('ok')
      },
    }
    registro.set(nombre, canal)
    return canal
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
    canales: registro,
    cliente: {
      from: vi.fn((tabla: string) => cadena(tabla)),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: SIN_ERROR })),
      channel: vi.fn((nombre: string) => crearCanal(nombre)),
      removeChannel: vi.fn((c: CanalDoble) => {
        registro.delete(c?.topic)
        return Promise.resolve('ok')
      }),
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
