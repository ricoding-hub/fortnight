// @vitest-environment jsdom
/**
 * La cascada del logo: imagen → icono → iniciales.
 *
 * El `onError` no es adorno. El favicon de un dominio puede no existir o no
 * llegar — red corporativa, bloqueador, sin conexión — y sin esa caída queda un
 * hueco roto en la lista. Es la misma cascada que ya usa la pantalla de
 * cuentas, y el punto de esta prueba es que no se rompa al copiarla.
 */
import '@/test/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { RecurringLogo } from '@/components/RecurringLogo'

afterEach(cleanup)

const cargo = (over: Record<string, unknown> = {}) =>
  ({ brand_id: null, name: 'Cargo', color: null, kind: 'fijo', ...over }) as never

describe('RecurringLogo', () => {
  it('carga el logo real cuando el proveedor tiene dominio', () => {
    const { container } = render(<RecurringLogo sub={cargo({ brand_id: 'cfe', name: 'CFE' })} />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img!.getAttribute('src')).toContain('cfe.mx')
  })

  it('si la imagen falla, cae al icono del proveedor y no deja hueco', () => {
    const { container } = render(<RecurringLogo sub={cargo({ brand_id: 'cfe', name: 'CFE' })} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('un proveedor sin dominio usa su icono desde el principio', () => {
    // La renta no tiene marca que cargar: pedir un favicon inexistente sería
    // una petición de red garantizada a fallar.
    const { container } = render(<RecurringLogo sub={cargo({ brand_id: 'renta', name: 'Renta' })} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('sin proveedor ni marca, iniciales', () => {
    const { container } = render(<RecurringLogo sub={cargo({ name: 'Tanda del trabajo' })} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('TA')
  })

  it('una suscripción conocida conserva sus iniciales de marca', () => {
    const { container } = render(
      <RecurringLogo sub={cargo({ brand_id: 'netflix', name: 'Netflix', kind: 'suscripcion' })} />,
    )
    expect(container.textContent).toBe('N')
  })

  it('un nombre vacío no revienta', () => {
    const { container } = render(<RecurringLogo sub={cargo({ name: '' })} />)
    expect(container.textContent).toBe('?')
  })
})
