// @vitest-environment jsdom
/**
 * El invariante que se saltaron cuatro hooks y tiró Inicio dos veces.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { crearSupabaseDoble } from '@/test/supabaseDoble'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

afterEach(cleanup)

describe('useTableChannel', () => {
  it('dos instancias montadas a la vez NO comparten canal', async () => {
    // Este es el fallo entero, en tres líneas. `RealtimeClient.channel(tema)`
    // devuelve el canal ya registrado si ese nombre existe, y `.on()` lanza si
    // ese canal ya está suscrito. Con el nombre `subs:${user.id}` bastaba con
    // que dos componentes montaran el mismo hook para que el segundo reventara
    // en tiempo de render: pantalla en blanco.
    doble = crearSupabaseDoble()
    const { useTableChannel } = await import('@/hooks/useTableChannel')

    function Escucha() {
      useTableChannel('subs', [{ table: 'subscriptions', filter: 'user_id=eq.u-1' }], () => {})
      return null
    }

    expect(() =>
      render(
        <>
          <Escucha />
          <Escucha />
          <Escucha />
        </>,
      ),
    ).not.toThrow()

    expect(doble.canales.size).toBe(3)
  })

  it('el nombre del canal no depende de nada que pueda repetirse', async () => {
    doble = crearSupabaseDoble()
    const { useTableChannel } = await import('@/hooks/useTableChannel')

    function Escucha() {
      useTableChannel('subs', [{ table: 'subscriptions' }], () => {})
      return null
    }
    render(
      <>
        <Escucha />
        <Escucha />
      </>,
    )
    const nombres = [...doble.canales.keys()]
    expect(new Set(nombres).size).toBe(nombres.length)
    for (const n of nombres) expect(n).toMatch(/^subs:.+/)
  })

  it('si suscribirse falla, la app sigue en pie', async () => {
    // El tiempo real es una mejora: los datos ya llegaron por la consulta. Que
    // un fallo al suscribirse deje al usuario sin pantalla es desproporcionado.
    doble = crearSupabaseDoble()
    doble.cliente.channel = vi.fn(() => {
      throw new Error('realtime caído')
    }) as unknown as typeof doble.cliente.channel
    const { useTableChannel } = await import('@/hooks/useTableChannel')
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Escucha() {
      useTableChannel('subs', [{ table: 'subscriptions' }], () => {})
      return <p>la vista sigue aquí</p>
    }
    const { container } = render(<Escucha />)
    expect(container.textContent).toContain('la vista sigue aquí')
    silencio.mockRestore()
  })
})

describe('ningún hook nombra su canal con algo que se repita', () => {
  it('todos los canales llevan una clave única, no el id del usuario', () => {
    // Guarda sobre el código fuente porque es la forma barata de que esto no
    // vuelva: el fallo no estaba en la lógica de ningún hook, sino en una
    // convención que catorce respetaban y cuatro no.
    const fuentes = import.meta.glob('./*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
    const culpables: string[] = []
    for (const [ruta, texto] of Object.entries(fuentes)) {
      if (ruta.includes('.test.')) continue
      for (const linea of texto.split('\n')) {
        if (/\.channel\(`/.test(linea) && !/\$\{channelKey\}|\$\{clave\}/.test(linea)) {
          culpables.push(`${ruta}: ${linea.trim()}`)
        }
      }
    }
    expect(culpables).toEqual([])
  })
})
