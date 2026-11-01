// @vitest-environment jsdom
/**
 * Moverse por la app: Préstamos en la barra, Perfil desde la foto, enlaces
 * viejos que siguen sirviendo.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { RedirigePrestamos } from '@/views/PrestamosLayout'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
afterEach(cleanup)

function Donde() {
  const { pathname } = useLocation()
  return <p data-testid="ruta">{pathname}</p>
}

describe('la barra de abajo', () => {
  it('trae Inicio, Cuentas, Préstamos y Plan (Perfil sale de la barra)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BottomNav />
      </MemoryRouter>,
    )
    const nombres = screen.getAllByRole('link').map((a) => a.textContent)
    expect(nombres).toEqual(['Inicio', 'Cuentas', 'Préstamos', 'Plan'])
  })

  it('en Préstamos, el «+» agrega un préstamo; dentro de una persona, un gasto compartido', () => {
    render(
      <MemoryRouter initialEntries={['/prestamos']}>
        <BottomNav />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Agregar préstamo' })).toBeTruthy()
    cleanup()
    render(
      <MemoryRouter initialEntries={['/prestamos/g-1']}>
        <BottomNav />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Agregar gasto compartido' })).toBeTruthy()
  })
})

describe('enlaces viejos', () => {
  it('/cuentas/prestamos/… lleva a /prestamos/…', () => {
    render(
      <MemoryRouter initialEntries={['/cuentas/prestamos/g-9']}>
        <Routes>
          <Route path="/cuentas/prestamos/:groupId" element={<RedirigePrestamos />} />
          <Route path="*" element={<Donde />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('ruta').textContent).toBe('/prestamos/g-9')
  })
})
