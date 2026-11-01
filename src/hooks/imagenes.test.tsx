// @vitest-environment jsdom
/**
 * Imágenes que «cargaban dos veces».
 *
 * La foto de perfil salía primero la de Google (metadatos de la sesión) y al
 * llegar `profiles` cambiaba a la que subiste. Los logos de banco pintaban un
 * cuadro blanco o el globo genérico y luego las iniciales, en cada visita.
 */
import '@/test/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { crearSupabaseDoble } from '@/test/supabaseDoble'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

const GOOGLE = 'https://lh3.googleusercontent.com/a/foto-google'
const SUBIDA = 'https://x.supabase.co/storage/v1/object/public/avatars/u-1/1.webp'

vi.mock('@/hooks/useAuth', () => {
  const user = {
    id: 'u-1',
    email: 'richy@fortnight.test',
    user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/foto-google', full_name: 'Richy' },
  }
  return { useAuth: () => ({ user }) }
})

afterEach(cleanup)
beforeEach(() => {
  window.localStorage.clear()
  vi.resetModules()
})

describe('useProfile: sin cambio de foto', () => {
  it('mientras llega el perfil no enseña la foto de Google', async () => {
    doble = crearSupabaseDoble({ tablas: { profiles: [{ id: 'u-1', display_name: null, avatar_url: SUBIDA }] } })
    const { useProfile } = await import('@/hooks/useProfile')
    const vistos: (string | undefined)[] = []
    renderHook(() => {
      const p = useProfile()
      vistos.push(p.avatarUrl)
      return p
    })
    // El primer cuadro se pinta antes de que conteste la base: iniciales.
    expect(vistos[0]).toBeUndefined()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(vistos.at(-1)).toBe(SUBIDA)
    expect(vistos).not.toContain(GOOGLE)
  })

  it('en la siguiente visita sale la foto propia desde el primer cuadro', async () => {
    window.localStorage.setItem('fortnight:perfil:u-1', JSON.stringify({ id: 'u-1', display_name: null, avatar_url: SUBIDA }))
    doble = crearSupabaseDoble({ tablas: { profiles: [{ id: 'u-1', display_name: null, avatar_url: SUBIDA }] } })
    const { useProfile } = await import('@/hooks/useProfile')
    const vistos: (string | undefined)[] = []
    renderHook(() => {
      const p = useProfile()
      vistos.push(p.avatarUrl)
      return p
    })
    expect(vistos[0]).toBe(SUBIDA)
    expect(vistos).not.toContain(GOOGLE)
  })

  it('sin foto propia, la de Google sí se usa una vez que se sabe', async () => {
    doble = crearSupabaseDoble({ tablas: { profiles: [{ id: 'u-1', display_name: null, avatar_url: null }] } })
    const { useProfile } = await import('@/hooks/useProfile')
    const { result } = renderHook(() => useProfile())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.avatarUrl).toBe(GOOGLE)
  })
})

describe('useLogoMarca: sin destello ni globo genérico', () => {
  async function Logo() {
    const { useLogoMarca } = await import('@/hooks/useLogoMarca')
    return function L({ dominio }: { dominio: string | null }) {
      const logo = useLogoMarca(dominio)
      return logo.mostrar ? (
        <img data-testid="logo" {...logo.img} alt="" data-cargado={logo.cargado ? 'si' : 'no'} />
      ) : (
        <span data-testid="iniciales">NU</span>
      )
    }
  }

  function anchoNatural(img: HTMLElement, w: number) {
    Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true })
  }

  it('la imagen va invisible hasta que carga', async () => {
    const L = await Logo()
    const { getByTestId } = render(<L dominio="nu.com.mx" />)
    const img = getByTestId('logo')
    expect(img.dataset.cargado).toBe('no')
    anchoNatural(img, 128)
    fireEvent.load(img)
    expect(getByTestId('logo').dataset.cargado).toBe('si')
  })

  it('el favicon genérico (16 px) cuenta como «sin logo» y se recuerda', async () => {
    const L = await Logo()
    const primera = render(<L dominio="sin-logo.mx" />)
    const img = primera.getByTestId('logo')
    anchoNatural(img, 16)
    fireEvent.load(img)
    expect(primera.queryByTestId('logo')).toBeNull()
    primera.unmount()

    // Otra visita (módulo nuevo): las iniciales salen desde el inicio.
    vi.resetModules()
    const L2 = await Logo()
    const segunda = render(<L2 dominio="sin-logo.mx" />)
    expect(segunda.queryByTestId('logo')).toBeNull()
    expect(segunda.getByTestId('iniciales')).toBeTruthy()
  })

  it('un error de carga también se recuerda', async () => {
    const L = await Logo()
    const r = render(<L dominio="roto.mx" />)
    fireEvent.error(r.getByTestId('logo'))
    expect(r.queryByTestId('logo')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('fortnight:logos-sin-marca') ?? '[]')).toContain('roto.mx')
  })

  it('al cambiar de dominio se vuelve a intentar', async () => {
    const L = await Logo()
    const r = render(<L dominio="roto.mx" />)
    fireEvent.error(r.getByTestId('logo'))
    r.rerender(<L dominio="nu.com.mx" />)
    expect(r.getByTestId('logo').getAttribute('src')).toContain('nu.com.mx')
  })
})
