// @vitest-environment jsdom
/**
 * «Me sale el nombre de mi conexión como "Richy" cuando la conexión es con
 * Toño». Toño creó la conexión: la llamó «Richy» y su propia fila quedó como
 * «Yo». Aquí la abre Richy, que es quien NO la creó.
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
  id, group_id: 'g-1', user_id: 'u-2', name, is_me: false, member_user_id: null,
  left_at: null, created_at: '2026-01-01T00:00:00Z', ...extra,
})

const TABLAS: Filas = {
  // Creada por Toño (u-2) y nombrada desde su lado.
  split_groups: [{ id: 'g-1', user_id: 'u-2', name: 'Richy', emoji: null, image_url: null, invite_code: 'c', created_at: '2026-01-01T00:00:00Z', archived_at: null }],
  split_members: [
    miembro('m-tono', 'Yo', { is_me: true, member_user_id: 'u-2' }),
    miembro('m-richy', 'Richy', { member_user_id: 'u-1' }),
  ],
  split_expenses: [{
    id: 'e1', group_id: 'g-1', user_id: 'u-2', description: 'Gta 6', amount: 940, paid_by_member_id: 'm-tono',
    split_method: 'equal', account_id: null, category_id: null, expense_date: '2026-10-09', created_at: '2026-10-13T15:00:00Z',
  }],
  split_expense_shares: [
    { id: 's1', expense_id: 'e1', member_id: 'm-richy', user_id: 'u-2', amount: 940, weight: null, group_id: 'g-1', created_at: '' },
  ],
  split_settlements: [],
  split_activity: [],
  split_invites: [],
  profiles: [
    { id: 'u-1', display_name: 'Richy', avatar_url: null, email: 'r@x.mx', created_at: '' },
    { id: 'u-2', display_name: 'Toño Trenado', avatar_url: null, email: 't@x.mx', created_at: '' },
  ],
  loans: [],
  loan_payments: [],
  categories: [],
  accounts: [{
    id: 'a1', user_id: 'u-1', name: 'BBVA', type: 'debit', balance: 5000, credit_limit: null, sort_order: 1,
    source: 'manual', created_at: '2026-01-01T00:00:00Z', updated_at: '',
  }],
}

async function montar() {
  doble = crearSupabaseDoble({ tablas: TABLAS })
  const { PrestamoGrupo } = await import('@/views/Cuentas/PrestamoGrupo')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/cuentas/prestamos/g-1']}>
        <Routes>
          <Route path="/cuentas/prestamos/:groupId" element={<PrestamoGrupo />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
  await esperarA(/Gta 6|No encontrado/)
  await asentar(6)
}

const clic = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el)
  })
  await asentar(3)
}

describe('una conexión vista por quien no la creó', () => {
  it('se llama como la otra persona, nunca como el grupo ni «Yo»', { timeout: 20_000 }, async () => {
    await montar()
    expect(screen.getByText('Toño Trenado', { selector: 'p' })).toBeTruthy()
    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(/Richy/)
    expect(texto).not.toMatch(/\bYo\b/)
    expect(texto).toMatch(/Le debes a Toño Trenado/)
  })

  it('«Saldar todo» y liquidar dicen con quién', { timeout: 20_000 }, async () => {
    await montar()
    await clic(screen.getByRole('button', { name: /Saldar todo/ }))
    expect(screen.getByText('Saldar todo · Toño Trenado')).toBeTruthy()
  })

  it('liquidar un monto: «Tú → Toño Trenado»', { timeout: 20_000 }, async () => {
    await montar()
    await clic(screen.getByRole('button', { name: /Abonar otro monto/ }))
    expect(document.body.textContent).toMatch(/Tú → Toño Trenado/)
  })

  it('un gasto en la conexión se reparte mitad y mitad, o todo de uno', { timeout: 20_000 }, async () => {
    await montar()
    await clic(screen.getByRole('button', { name: '+ Gasto' }))
    // No los métodos de grupo: tres opciones de conexión.
    expect(screen.getByRole('radio', { name: 'Mitad y mitad' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Toño te debe todo' })).toBeTruthy()
    expect(screen.queryByText('Partes')).toBeNull()
    // «Pagó»: tú y la otra persona, con sus nombres visibles.
    const pago = screen.getByLabelText('Pagó') as HTMLSelectElement
    expect([...pago.options].map((o) => o.textContent)).toEqual(['Tú', 'Toño Trenado'])

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Cena' } })
      fireEvent.change(screen.getByLabelText(/^Monto/), { target: { value: '300' } })
    })
    await clic(screen.getByRole('radio', { name: 'Toño te debe todo' }))
    expect(document.body.textContent).toMatch(/Toño Trenado te debe \$300\.00/)
    await clic(screen.getByRole('button', { name: 'Registrar gasto' }))
    await asentar(4)
    const partes = doble.llamadas.find((l) => l.tabla === 'split_expense_shares' && l.op === 'insert')
    expect(partes?.payload).toEqual([expect.objectContaining({ member_id: 'm-tono', amount: 300 })])
  })

  it('«Otro reparto» abre los métodos de siempre', { timeout: 20_000 }, async () => {
    await montar()
    await clic(screen.getByRole('button', { name: '+ Gasto' }))
    await clic(screen.getByRole('radio', { name: 'Otro reparto' }))
    expect(screen.getByText('Partes')).toBeTruthy()
  })

  it('el movimiento en tu cuenta dice con quién, sin el nombre del grupo', { timeout: 20_000 }, async () => {
    await montar()
    await clic(screen.getByRole('button', { name: /Abonar otro monto/ }))
    await clic(screen.getByRole('switch'))
    await clic(screen.getByRole('button', { name: 'Confirmar liquidación' }))
    await asentar(4)
    const mov = doble.llamadas.find((l) => l.tabla === 'transactions' && l.op === 'insert')
    expect((mov?.payload as { description: string }).description).toBe('Liquidación con Toño Trenado')
  })
})
