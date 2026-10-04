// @vitest-environment jsdom
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Segmented } from '@/components/ui/Segmented'

afterEach(cleanup)

describe('Segmented', () => {
  const opciones = [
    { value: 'a', label: 'Uno' },
    { value: 'b', label: 'Dos', tone: 'debt' as const },
  ]

  it('es un grupo de opciones con nombre, no botones sueltos', () => {
    // Lo cuatro formularios que lo reimplementaban no decían a un lector de
    // pantalla que eran opciones de un mismo grupo.
    render(<Segmented ariaLabel="Elige" value="a" onChange={() => {}} options={opciones} />)
    expect(screen.getByRole('radiogroup', { name: 'Elige' })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('marca la activa y cambia al tocar otra', () => {
    const cambia = vi.fn()
    render(<Segmented ariaLabel="Elige" value="a" onChange={cambia} options={opciones} />)
    expect(screen.getByRole('radio', { name: 'Uno' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Dos' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('radio', { name: 'Dos' }))
    expect(cambia).toHaveBeenCalledWith('b')
  })

  it('funciona con valores booleanos', () => {
    const cambia = vi.fn()
    render(
      <Segmented
        ariaLabel="¿Sí o no?"
        value={true}
        onChange={cambia}
        options={[{ value: true, label: 'Sí' }, { value: false, label: 'No' }]}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(cambia).toHaveBeenCalledWith(false)
  })

  it('la opción activa tiene contraste suficiente: tono con texto blanco', () => {
    // asset-ink, debt-ink y primary-deep dan 6.1, 6.2 y 8.6 : 1 con blanco.
    render(<Segmented ariaLabel="Elige" value="b" onChange={() => {}} options={opciones} />)
    const activa = screen.getByRole('radio', { name: 'Dos' })
    expect(activa.className).toContain('bg-debt-ink')
    expect(activa.className).toContain('text-white')
  })

  it('con anchos por contenido, cada opción toma el suyo', () => {
    render(<Segmented ariaLabel="Elige" ancho="content" value="a" onChange={() => {}} options={opciones} />)
    expect(screen.getByRole('radio', { name: 'Uno' }).className).toContain('flex-auto')
  })
})
