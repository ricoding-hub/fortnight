// @vitest-environment jsdom
/**
 * Editar un plan a meses, tras sacar sus campos a `InstallmentFields`.
 *
 * El archivo pasó de 394 líneas a un envoltorio de 48: la prueba es lo que dice
 * que no se perdió nada por el camino.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { crearSupabaseDoble } from '@/test/supabaseDoble'
import { asentar, esperarA } from '@/test/espera'
import type { Installment } from '@/types'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

afterEach(cleanup)

const PLAN: Installment = {
  id: 'i-1', user_id: 'u-1', account_id: 'a-2', name: 'Laptop', total_amount: 9000, monthly_amount: 750,
  months_total: 12, months_paid: 3, start_date: '2026-06-29', status: 'active', is_zero_interest: true,
  created_at: '', updated_at: '',
} as Installment

const TARJETA = {
  id: 'a-2', user_id: 'u-1', name: 'Nu', type: 'credit', balance: 4000, credit_limit: 20000, sort_order: 0,
  created_at: '', updated_at: '', source: 'manual',
}

async function abrir(plan?: Installment) {
  doble = crearSupabaseDoble({ tablas: { accounts: [TARJETA], installments: [] } })
  const onSubmit = vi.fn(async () => {})
  const onUpdate = vi.fn(async () => {})
  const onClose = vi.fn()
  const { InstallmentFormModal } = await import('@/components/InstallmentFormModal')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <InstallmentFormModal open onClose={onClose} onSubmit={onSubmit} onUpdate={onUpdate} editingInstallment={plan} />
    </AuthProvider>,
  )
  await esperarA(/Laptop|compra a meses|plan a meses/i)
  await asentar(8)
  return { onSubmit, onUpdate, onClose }
}

describe('editar un plan a meses', () => {
  it('abre con todo a la vista y los valores del plan', { timeout: 20_000 }, async () => {
    await abrir(PLAN)
    expect((screen.getByLabelText('¿Qué compraste?') as HTMLInputElement).value).toBe('Laptop')
    expect((screen.getByLabelText('Monto total') as HTMLInputElement).value).toBe('9000')
    expect((screen.getByLabelText('Meses') as HTMLSelectElement).value).toBe('12')
    // Editar quiere ver todo: «Más opciones» ya viene abierto.
    expect((screen.getByLabelText('Pagos ya hechos') as HTMLSelectElement).value).toBe('3')
    expect(screen.getByText(/Quedan 9 meses por pagar/)).toBeTruthy()
  })

  it('al editar no pregunta si ya está en el saldo', { timeout: 20_000 }, async () => {
    // Cambiarlo después es el caso ambiguo; sólo se ofrece al crear.
    await abrir(PLAN)
    expect(screen.queryByText('¿Ya está en el saldo de la tarjeta?')).toBeNull()
  })

  it('marcar todos los pagos lo deja como pagado', { timeout: 20_000 }, async () => {
    const { onUpdate } = await abrir(PLAN)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Pagos ya hechos'), { target: { value: '12' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })
    await asentar(6)
    expect(onUpdate).toHaveBeenCalledWith('i-1', expect.objectContaining({ months_paid: 12, status: 'paid' }))
  })

  it('un plazo que no está en la lista (10 meses) no se pierde', { timeout: 20_000 }, async () => {
    await abrir({ ...PLAN, months_total: 10, monthly_amount: 900 })
    expect((screen.getByLabelText('Meses') as HTMLSelectElement).value).toBe('10')
  })

  it('acortar el plazo no deja más pagos que meses', { timeout: 20_000 }, async () => {
    // Antes "20 de 12 pagados" volvía negativo el restante y la tarjeta BAJABA.
    await abrir({ ...PLAN, months_paid: 9 })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Meses'), { target: { value: '6' } })
    })
    await asentar(4)
    expect((screen.getByLabelText('Pagos ya hechos') as HTMLSelectElement).value).toBe('6')
  })

  it('crear uno nuevo trae el título y los valores por omisión', { timeout: 20_000 }, async () => {
    await abrir()
    expect(screen.getByText('Nueva compra a meses')).toBeTruthy()
    expect((screen.getByLabelText('Meses') as HTMLSelectElement).value).toBe('12')
    expect(screen.queryByLabelText('Pagos ya hechos')).toBeNull()
  })
})
