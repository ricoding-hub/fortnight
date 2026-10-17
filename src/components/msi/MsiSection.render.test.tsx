// @vitest-environment jsdom
/**
 * «Se revolvió con la gestión de MSI»: la sección de Cuentas montada de verdad.
 * Dice en qué mensualidad va, explica cada mes y deja corregirlos.
 */
import '@/test/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { crearSupabaseDoble } from '@/test/supabaseDoble'
import { asentar } from '@/test/espera'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))
vi.mock('@/lib/esquema', () => ({ tieneEsquemaMsi: () => Promise.resolve(true) }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, 12))
  localStorage.setItem('fortnight:msi:aviso-pagos', '1')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const TARJETA = {
  id: 'c1', user_id: 'u-1', name: 'BBVA', type: 'credit', balance: 9000, credit_limit: 50000,
  cut_day: 15, payment_due_day: 5, payment_grace_days: null, sort_order: 1, source: 'manual',
  created_at: '2026-01-01T00:00:00Z', updated_at: '',
}
const PLAN = {
  id: 'p1', user_id: 'u-1', account_id: 'c1', name: 'iPhone', total_amount: 12000, monthly_amount: 1000,
  months_total: 12, months_paid: 0, start_date: '2026-07-03', status: 'active', is_zero_interest: true,
  created_at: '2026-07-03T18:00:00Z', updated_at: '', month_status: { _v: 2 }, billing_offset: 0,
  cuenta: { type: 'credit', cut_day: 15, payment_due_day: 5, payment_grace_days: null },
  vinculados: [{ id: 't1', amount: 12000, account_id: 'c1', date: '2026-07-03', type: 'installment' }],
}

async function montar() {
  doble = crearSupabaseDoble({ tablas: { accounts: [TARJETA], installments: [PLAN] } })
  const { MsiSection } = await import('./MsiSection')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <MemoryRouter>
        <MsiSection accounts={[TARJETA] as never} updateBalance={async () => {}} />
      </MemoryRouter>
    </AuthProvider>,
  )
  await asentar(8)
}

const clic = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el)
  })
  await asentar(3)
}

describe('MSI en Cuentas', () => {
  it('dice en qué mensualidad va y qué toca, sin tocar nada', { timeout: 20_000 }, async () => {
    await montar()
    expect(screen.getByText('Mensualidad 4 de 12')).toBeTruthy()
    expect(screen.getByText('En tu estado de cuenta · vence el 5 nov')).toBeTruthy()
    // El estado de cuenta de la tarjeta: corte, fecha de pago y cuánto de MSI trae.
    expect(document.body.textContent).toMatch(/vence 5 nov · \$1,000\.00 en mensualidades/)
  })

  it('el detalle explica cada mes y deja marcar uno', { timeout: 20_000 }, async () => {
    await montar()
    await clic(screen.getByRole('button', { name: /iPhone: ver mensualidades/ }))
    // Las dos primeras, antes de la ventana de movimientos: las decide la fecha.
    expect(screen.getAllByText(/Pagada sola: pasó su fecha límite/)).toHaveLength(2)
    // La 3ª: en el corte del 15 sep sólo quedaba lo que aún no se cobra, o sea, ya se pagó.
    expect(screen.getByText(/Cubierta con tus pagos a BBVA/)).toBeTruthy()
    expect(screen.getByText(/Ya está en tu estado de cuenta/)).toBeTruthy()
    await clic(screen.getByRole('button', { name: 'Cambiar la mensualidad 4' }))
    await clic(screen.getByRole('button', { name: /Marcar pagada/ }))
    const upd = doble.llamadas.find((l) => l.tabla === 'installments' && l.op === 'update')
    expect((upd?.payload as { month_status: Record<string, unknown> }).month_status).toMatchObject({
      '4': { s: 'paid', at: '2026-10-20' },
    })
  })

  it('en un plan con tarjeta, el botón paga la tarjeta en vez de marcar sin mover dinero', { timeout: 20_000 }, async () => {
    await montar()
    expect(screen.queryByRole('button', { name: /Ya pagué la mensualidad/ })).toBeNull()
    await clic(screen.getByRole('button', { name: 'Pagar BBVA' }))
    const { useUiStore } = await import('@/store/uiStore')
    expect(useUiStore.getState().tarjeta).toMatchObject({ accountId: 'c1', vista: 'pagar' })
    expect(doble.llamadas.some((l) => l.tabla === 'installments' && l.op === 'update')).toBe(false)
  })

  it('eliminar con pagos hechos no quita el cargo salvo que lo pidas', { timeout: 20_000 }, async () => {
    await montar()
    await clic(screen.getByRole('button', { name: /iPhone: ver mensualidades/ }))
    await clic(screen.getByRole('button', { name: /Eliminar plan/ }))
    const casilla = screen.getByRole('checkbox', { name: /Quitar también el cargo/ }) as HTMLInputElement
    expect(casilla.checked).toBe(false)
    await clic(screen.getByRole('button', { name: 'Eliminar' }))
    expect(doble.llamadas.some((l) => l.tabla === 'transactions' && l.op === 'delete')).toBe(false)
    expect(doble.llamadas.some((l) => l.tabla === 'installments' && l.op === 'delete')).toBe(true)
  })
})
