// @vitest-environment jsdom
/**
 * «A Tony no le salen los links para invitar.»
 *
 * En un grupo, el enlace vivía dentro de una sección plegada; al crear un grupo
 * no aparecía; y en una conexión 1:1 sin conectar sólo estaba en el bloque del
 * saldo. Estas pruebas montan la pantalla y buscan el enlace donde lo buscaría
 * una persona.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { crearSupabaseDoble, type Filas } from '@/test/supabaseDoble'
import { asentar, esperarA } from '@/test/espera'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

afterEach(cleanup)

const miembro = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, group_id: 'g-1', user_id: 'u-1', name, is_me: false, member_user_id: null,
  left_at: null, created_at: '2026-01-01T00:00:00Z', ...extra,
})

const base = (miembros: ReturnType<typeof miembro>[], nombre: string): Filas => ({
  split_groups: [{ id: 'g-1', user_id: 'u-1', name: nombre, emoji: null, image_url: null, invite_code: 'cod-123', created_at: '2026-01-01T00:00:00Z', archived_at: null }],
  split_members: miembros,
  split_expenses: [],
  split_expense_shares: [],
  split_settlements: [],
  split_activity: [],
  split_invites: [],
  profiles: [{ id: 'u-1', display_name: 'Richy', avatar_url: null, email: 'r@x.mx', created_at: '' }],
  loans: [],
  loan_payments: [],
  categories: [],
})

const GRUPO = base(
  [
    miembro('m-yo', 'Richy', { is_me: true, member_user_id: 'u-1' }),
    miembro('m-ana', 'Ana', { member_user_id: 'u-2' }),
    miembro('m-luis', 'Luis'),
    miembro('m-pepe', 'Pepe'),
  ],
  'Viaje',
)

const CONEXION = base(
  [miembro('m-yo', 'Richy', { is_me: true, member_user_id: 'u-1' }), miembro('m-tony', 'Tony')],
  'Tony',
)

async function montar(tablas: Filas, state?: unknown) {
  doble = crearSupabaseDoble({ tablas })
  const { PrestamoGrupo } = await import('@/views/Cuentas/PrestamoGrupo')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[{ pathname: '/cuentas/prestamos/g-1', state }]}>
        <Routes>
          <Route path="/cuentas/prestamos/:groupId" element={<PrestamoGrupo />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
  await esperarA(/Viaje|Tony|No encontrado/)
  await asentar(6)
}

const enlace = () => screen.queryByDisplayValue(/\/join\/cod-123$/)

describe('invitar a un grupo', () => {
  it('dice quién falta y ofrece invitar sin abrir nada', { timeout: 20_000 }, async () => {
    await montar(GRUPO)
    expect(screen.getByText('2 de 4 con cuenta')).toBeTruthy()
    expect(screen.getByText('Faltan Luis y Pepe')).toBeTruthy()
    expect(enlace()).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Invitar/ }))
    })
    await asentar(2)
    expect(enlace()).toBeTruthy()
    expect(screen.getByRole('button', { name: /Copiar/ })).toBeTruthy()
  })

  it('al llegar recién creado, el enlace ya está abierto', { timeout: 20_000 }, async () => {
    await montar(GRUPO, { invitar: true })
    expect(enlace()).toBeTruthy()
  })
})

describe('invitar en una conexión 1:1', () => {
  it('sin conectar: el bloque del saldo ofrece invitar a esa persona', { timeout: 20_000 }, async () => {
    await montar(CONEXION)
    const boton = screen.getByRole('button', { name: /Invitar a Tony a conectarse/ })
    await act(async () => {
      fireEvent.click(boton)
    })
    await asentar(2)
    expect(enlace()).toBeTruthy()
    // En 1:1 no se agrega gente: sólo se invita a esa persona.
    expect(document.body.textContent).not.toContain('O agrégala sin cuenta')
  })

  it('al llegar desde «Invitar a Tony», el enlace ya está abierto', { timeout: 20_000 }, async () => {
    await montar(CONEXION, { invitar: true })
    expect(enlace()).toBeTruthy()
  })
})
